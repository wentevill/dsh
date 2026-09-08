import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  CronCreateRequest,
  CronDefinitionWire,
  CronExecutionWire,
  CronHistoryResult,
  CronIdRequest,
  CronListRequest,
  CronListResult,
  CronMutationResult,
  CronUpdateRequest,
} from '../remote-types.ts'
import type { CronListScope } from '../commands.ts'

export type RemoteResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: unknown }

export interface CronRemotePort {
  list(request: CronListRequest): Promise<RemoteResult<CronListResult>>
  history(request: { sessionId: SessionId; cronId: string; cursor?: string; limit?: number }): Promise<RemoteResult<CronHistoryResult>>
  create(request: CronCreateRequest): Promise<RemoteResult<CronMutationResult>>
  update(request: CronUpdateRequest): Promise<RemoteResult<CronMutationResult>>
  pause(request: CronIdRequest): Promise<RemoteResult<CronMutationResult>>
  resume(request: CronIdRequest): Promise<RemoteResult<CronMutationResult>>
  delete(request: CronIdRequest): Promise<RemoteResult<CronMutationResult>>
}

export interface CronManagerSnapshot {
  readonly scope: CronListScope
  readonly items: readonly CronDefinitionWire[]
  readonly selectedCronId?: string
  readonly history: readonly CronExecutionWire[]
  readonly historyCursor?: string
  readonly busy: boolean
  readonly error?: 'unavailable'
  readonly revision: number
}

/** Local UI state machine over the exact Cron Remote methods. */
export class CronManagerController {
  private snapshot: CronManagerSnapshot
  private readonly listeners = new Set<() => void>()
  private listRequest = 0
  private listApplied = 0
  private historyRequest = 0
  private initialized = false

  constructor(
    private readonly sessionId: SessionId,
    private readonly remote: CronRemotePort,
    scope: CronListScope = 'related',
  ) {
    this.snapshot = { scope, items: [], history: [], busy: false, revision: 0 }
  }

  getSnapshot = (): CronManagerSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  initialize(): Promise<void> {
    if (this.initialized) return Promise.resolve()
    this.initialized = true
    return this.load(this.snapshot.scope)
  }

  async load(scope: CronListScope = this.snapshot.scope): Promise<void> {
    const request = ++this.listRequest
    this.publish({ ...this.snapshot, scope, busy: true, error: undefined })
    try {
      const items = unwrap(await this.remote.list({ sessionId: this.sessionId, scope }))
      if (request < this.listApplied || request !== this.listRequest) return
      this.listApplied = request
      const selectedCronId = chooseSelection(this.snapshot.selectedCronId, items)
      this.publish({
        ...this.snapshot, scope, items, selectedCronId, history: [], historyCursor: undefined,
        busy: false, revision: request,
      })
      if (selectedCronId !== undefined) await this.loadHistory(false)
    } catch {
      if (request !== this.listRequest) return
      this.publish({ ...this.snapshot, scope, busy: false, error: 'unavailable', revision: request })
    }
  }

  async select(cronId: string): Promise<void> {
    if (!this.snapshot.items.some(item => item.id === cronId)) return
    this.publish({ ...this.snapshot, selectedCronId: cronId, history: [], historyCursor: undefined })
    await this.loadHistory(false)
  }

  async loadHistory(append = true): Promise<void> {
    const cronId = this.snapshot.selectedCronId
    if (cronId === undefined) return
    const request = ++this.historyRequest
    const cursor = append ? this.snapshot.historyCursor : undefined
    try {
      const page = unwrap(await this.remote.history(compact({
        sessionId: this.sessionId, cronId, cursor, limit: 50,
      })))
      if (request !== this.historyRequest || this.snapshot.selectedCronId !== cronId) return
      this.publish({
        ...this.snapshot,
        history: append ? [...this.snapshot.history, ...page.items] : page.items,
        historyCursor: page.nextCursor,
      })
    } catch {
      if (request === this.historyRequest) this.publish({ ...this.snapshot, error: 'unavailable' })
    }
  }

  create(request: Omit<CronCreateRequest, 'sessionId'>): Promise<void> {
    return this.mutate(() => this.remote.create({ sessionId: this.sessionId, ...request }))
  }

  update(cronId: string, expectedRevision: number, change: Omit<CronUpdateRequest, 'sessionId' | 'cronId' | 'expectedRevision'>): Promise<void> {
    return this.mutate(() => this.remote.update({
      sessionId: this.sessionId, cronId, expectedRevision, ...change,
    }))
  }

  pause(cronId: string): Promise<void> { return this.byId('pause', cronId) }
  resume(cronId: string): Promise<void> { return this.byId('resume', cronId) }
  delete(cronId: string): Promise<void> { return this.byId('delete', cronId) }

  private byId(method: 'pause' | 'resume' | 'delete', cronId: string): Promise<void> {
    return this.mutate(() => this.remote[method]({ sessionId: this.sessionId, cronId }))
  }

  private async mutate(operation: () => Promise<RemoteResult<CronMutationResult>>): Promise<void> {
    this.publish({ ...this.snapshot, busy: true, error: undefined })
    try {
      const changed = unwrap(await operation())
      const current = this.snapshot.items.find(item => item.id === changed.id)
      if (current === undefined || changed.revision >= current.revision) {
        this.publish({
          ...this.snapshot,
          items: replaceDefinition(this.snapshot.items, changed),
          selectedCronId: changed.id,
        })
      }
      await this.load(this.snapshot.scope)
    } catch {
      this.publish({ ...this.snapshot, busy: false, error: 'unavailable' })
    }
  }

  private publish(next: CronManagerSnapshot): void {
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }
}

function unwrap<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error('Cron Remote unavailable')
  return result.value
}

function chooseSelection(current: string | undefined, items: readonly CronDefinitionWire[]): string | undefined {
  if (current !== undefined && items.some(item => item.id === current)) return current
  return items[0]?.id
}

function replaceDefinition(items: readonly CronDefinitionWire[], changed: CronDefinitionWire): readonly CronDefinitionWire[] {
  const index = items.findIndex(item => item.id === changed.id)
  if (index < 0) return [...items, changed]
  return items.map(item => item.id === changed.id ? changed : item)
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T
}

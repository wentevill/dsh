/** Non-secret result of querying wecom-cli authorization. */
export interface AuthStatus {
  readonly authorized: boolean
  readonly botId?: string
}

/** Host-only operations needed by the authorization state machine. */
export interface AuthBackend {
  status(): Promise<AuthStatus>
  connect(options: { readonly signal: AbortSignal; readonly onQr: (dataUrl: string) => void }): Promise<void>
  deleteOwnedAuthorization(): Promise<void>
}

/** State projected to Plugin configuration. */
export type WeComAuthSnapshot =
  | { readonly state: 'unauthorized' }
  | { readonly state: 'generating_qr' }
  | { readonly state: 'awaiting_scan'; readonly qrDataUrl: string }
  | { readonly state: 'authorized'; readonly botId?: string }
  | { readonly state: 'refreshing_schema'; readonly botId?: string }
  | { readonly state: 'ready'; readonly botId?: string; readonly toolCount: number }
  | { readonly state: 'sync_failed'; readonly botId?: string; readonly message: string }
  | { readonly state: 'deleting'; readonly botId?: string }

interface AuthControllerOptions {
  readonly backend: AuthBackend
  readonly refreshTools: () => Promise<number>
  readonly clearTools: () => Promise<void>
}

/** Stateful authorization controller shared by the Host Remote and tool catalog. */
export function createWeComAuthController(options: AuthControllerOptions): {
  snapshot(): WeComAuthSnapshot
  subscribe(listener: (snapshot: WeComAuthSnapshot) => void): () => void
  initialize(): Promise<void>
  connect(): Promise<void>
  cancel(): void
  refresh(): Promise<void>
  deleteAuthorization(confirmed: boolean): Promise<void>
} {
  let current: WeComAuthSnapshot = { state: 'unauthorized' }
  let active: AbortController | undefined
  const listeners = new Set<(snapshot: WeComAuthSnapshot) => void>()

  const publish = (snapshot: WeComAuthSnapshot): void => {
    current = snapshot
    for (const listener of listeners) listener(snapshot)
  }

  const refreshAuthorized = async (status: AuthStatus): Promise<void> => {
    const identity = status.botId === undefined ? {} : { botId: status.botId }
    publish({ state: 'authorized', ...identity })
    publish({ state: 'refreshing_schema', ...identity })
    try {
      const toolCount = await options.refreshTools()
      publish({ state: 'ready', ...identity, toolCount })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'API synchronization failed'
      publish({ state: 'sync_failed', ...identity, message })
    }
  }

  const initialize = async (): Promise<void> => {
    const status = await options.backend.status()
    if (!status.authorized) {
      await options.clearTools()
      publish({ state: 'unauthorized' })
      return
    }
    await refreshAuthorized(status)
  }

  const connect = async (): Promise<void> => {
    if (active !== undefined) throw new Error('authorization already in progress')
    const generation = new AbortController()
    active = generation
    publish({ state: 'generating_qr' })
    try {
      await options.backend.connect({
        signal: generation.signal,
        onQr: qrDataUrl => { publish({ state: 'awaiting_scan', qrDataUrl }) },
      })
      if (generation.signal.aborted) return
      const status = await options.backend.status()
      if (!status.authorized) {
        publish({ state: 'unauthorized' })
        return
      }
      await refreshAuthorized(status)
    } catch (error) {
      if (!generation.signal.aborted) {
        const message = error instanceof Error ? error.message : 'authorization failed'
        publish({ state: 'sync_failed', message })
      }
    } finally {
      if (active === generation) active = undefined
    }
  }

  return {
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    initialize,
    connect,
    cancel() {
      active?.abort()
      publish({ state: 'unauthorized' })
    },
    async refresh() {
      const status = await options.backend.status()
      if (!status.authorized) {
        await options.clearTools()
        publish({ state: 'unauthorized' })
        return
      }
      await refreshAuthorized(status)
    },
    async deleteAuthorization(confirmed) {
      if (!confirmed) throw new Error('authorization deletion confirmation required')
      active?.abort()
      const botId = 'botId' in current ? current.botId : undefined
      publish(botId === undefined ? { state: 'deleting' } : { state: 'deleting', botId })
      await options.clearTools()
      await options.backend.deleteOwnedAuthorization()
      publish({ state: 'unauthorized' })
    },
  }
}

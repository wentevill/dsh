import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { CronId } from './brand.ts'
import type { CronCommandService } from './commands.ts'
import { CronFailure, cronFailure } from './errors.ts'
import type {
  CronCreateRequest,
  CronHistoryResult,
  CronHistoryRequest,
  CronIdRequest,
  CronListRequest,
  CronListResult,
  CronMutationResult,
  CronUpdateRequest,
} from './remote-types.ts'

/** Browser Remote facade; every operation delegates Workspace authorization to commands. */
export class CronRemote extends TypertRemoteService {
  constructor(ctx: Context, private readonly commands: CronCommandService) {
    super(ctx, 'cron')
  }

  @Remote('list')
  list(request: CronListRequest): Promise<CronListResult> {
    return bounded(() => this.commands.list(request.sessionId, request.scope))
  }

  @Remote('history')
  history(request: CronHistoryRequest): Promise<CronHistoryResult> {
    const { sessionId, cronId, cursor, limit } = request
    return bounded(() => this.commands.history(
      sessionId, CronId(cronId), compact({ cursor, limit }),
    ))
  }

  @Remote('create')
  create(request: CronCreateRequest): Promise<CronMutationResult> {
    const { sessionId, ...input } = request
    return bounded(() => this.commands.create(sessionId, input))
  }

  @Remote('update')
  update(request: CronUpdateRequest): Promise<CronMutationResult> {
    const { sessionId, cronId, expectedRevision, ...input } = request
    return bounded(() => this.commands.update(sessionId, CronId(cronId), expectedRevision, input))
  }

  @Remote('pause')
  pause(request: CronIdRequest): Promise<CronMutationResult> {
    return bounded(() => this.commands.pause(request.sessionId, CronId(request.cronId)))
  }

  @Remote('resume')
  resume(request: CronIdRequest): Promise<CronMutationResult> {
    return bounded(() => this.commands.resume(request.sessionId, CronId(request.cronId)))
  }

  @Remote('delete')
  delete(request: CronIdRequest): Promise<CronMutationResult> {
    return bounded(() => this.commands.delete(request.sessionId, CronId(request.cronId)))
  }
}

async function bounded<T>(operation: () => T | Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof CronFailure) throw error
    throw cronFailure('internal_error')
  }
}

function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as Partial<T>
}

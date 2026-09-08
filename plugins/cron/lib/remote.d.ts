import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { CronCommandService } from './commands.ts';
import type { CronCreateRequest, CronHistoryResult, CronHistoryRequest, CronIdRequest, CronListRequest, CronListResult, CronMutationResult, CronUpdateRequest } from './remote-types.ts';
/** Browser Remote facade; every operation delegates Workspace authorization to commands. */
export declare class CronRemote extends TypertRemoteService {
    private readonly commands;
    constructor(ctx: Context, commands: CronCommandService);
    list(request: CronListRequest): Promise<CronListResult>;
    history(request: CronHistoryRequest): Promise<CronHistoryResult>;
    create(request: CronCreateRequest): Promise<CronMutationResult>;
    update(request: CronUpdateRequest): Promise<CronMutationResult>;
    pause(request: CronIdRequest): Promise<CronMutationResult>;
    resume(request: CronIdRequest): Promise<CronMutationResult>;
    delete(request: CronIdRequest): Promise<CronMutationResult>;
}

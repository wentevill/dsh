import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { type AuthRemoteController } from './auth-remote.ts';
import type { WeComAuthSnapshot } from './remote-types.ts';
export interface Config {
    readonly configDir?: string;
    readonly timeoutMs?: number;
    readonly maxOutputBytes?: number;
}
export declare const Config: z<Config>;
export declare const name = "wecom";
export declare const inject: string[];
export declare class WeComAuthRemote extends TypertRemoteService {
    private readonly api;
    constructor(ctx: Context, controller: AuthRemoteController);
    status(): WeComAuthSnapshot;
    connect(): WeComAuthSnapshot;
    cancel(): WeComAuthSnapshot;
    refresh(): Promise<WeComAuthSnapshot>;
    deleteAuthorization(confirmed: boolean): Promise<WeComAuthSnapshot>;
}
/** Standard Cordis Host entry. Dynamic tools exist only while authorization is valid. */
export declare function apply(ctx: Context, config: Config): void;
export type { WeComAuthSnapshot } from './remote-types.ts';

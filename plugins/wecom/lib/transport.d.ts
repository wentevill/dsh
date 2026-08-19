/** JSON values accepted and returned by the WeCom discovery protocol. */
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    readonly [key: string]: JsonValue;
};
/** One bounded, shell-free process invocation. */
export interface ProcessInvocation {
    readonly executable: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly env: Readonly<Record<string, string>>;
    readonly maxOutputBytes: number;
    readonly timeoutMs: number;
    readonly signal: AbortSignal | undefined;
}
/** Result captured by the process executor. */
export interface ProcessResult {
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
}
/** Injectable process seam used by the production subprocess adapter and tests. */
export type ProcessExecutor = (invocation: ProcessInvocation) => Promise<ProcessResult>;
/** Create the production executor used for shell-free CLI child processes. */
export declare function createNodeProcessExecutor(): ProcessExecutor;
/** One remote CLI operation. */
export interface WeComRunRequest {
    readonly path: readonly string[];
    readonly body?: JsonValue;
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
}
/** Canonical value plus bounded non-model diagnostic text. */
export interface WeComRunResult {
    readonly value: JsonValue;
    readonly stderr: string;
}
/** Structured failure projected from a non-zero wecom-cli exit. */
export declare class WeComCliError extends Error {
    readonly exitCode: number;
    readonly code?: number | undefined;
    readonly name = "WeComCliError";
    constructor(message: string, exitCode: number, code?: number | undefined);
}
interface RunnerOptions {
    readonly executable: string;
    readonly configDir: string;
    readonly tempDir: string;
    readonly execute: ProcessExecutor;
    readonly maxOutputBytes?: number;
    readonly timeoutMs?: number;
}
/** Build a runner bound to one DSH profile and one packaged CLI executable. */
export declare function createWeComProcessRunner(options: RunnerOptions): {
    run(request: WeComRunRequest): Promise<WeComRunResult>;
};
export {};

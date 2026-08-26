export interface PrivateRuntimePaths {
    readonly node: string;
    readonly dsh: string;
    readonly packageBin: string;
    readonly dshHome: string;
}
export interface CommandResult {
    readonly code: number;
    readonly stderr: string;
}
export interface CommandOptions {
    readonly env: NodeJS.ProcessEnv;
    readonly signal?: AbortSignal;
}
export type CommandRunner = (command: string, args: readonly string[], options: CommandOptions) => Promise<CommandResult>;
export declare const runCommand: CommandRunner;
export declare class PluginCli {
    private readonly paths;
    private readonly runner;
    constructor(paths: PrivateRuntimePaths, runner?: CommandRunner);
    install(archivePath: string, signal?: AbortSignal): Promise<void>;
    uninstall(packageName: string, signal?: AbortSignal): Promise<void>;
    private execute;
}

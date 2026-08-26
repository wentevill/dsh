import type { PrivateRuntimePaths } from './cli.ts';
export interface ProcessFacts {
    readonly execPath: string;
    readonly argv1: string | undefined;
    readonly dshHome: string | undefined;
}
export declare function resolvePrivateRuntime(facts: ProcessFacts): Promise<PrivateRuntimePaths>;

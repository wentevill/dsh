import type { DiscoveredMethod } from './discovery.ts';
import { type OperationRisk } from './policy.ts';
import type { JsonValue, WeComRunRequest, WeComRunResult } from './transport.ts';
interface Runner {
    run(request: WeComRunRequest): Promise<WeComRunResult>;
}
type PreDecision = {
    readonly kind: 'allow';
} | {
    readonly kind: 'ask';
    readonly reason: string;
};
/** Runtime-neutral tool behavior later wrapped by DSH defineTool. */
export interface RuntimeTool {
    readonly method: DiscoveredMethod;
    readonly risk: OperationRisk;
    preDecision(args: unknown): PreDecision;
    execute(args: JsonValue, signal: AbortSignal): Promise<JsonValue>;
}
/** Bind one discovered method to policy and the profile-confined CLI runner. */
export declare function createRuntimeTool(method: DiscoveredMethod, runner: Runner): RuntimeTool;
export {};

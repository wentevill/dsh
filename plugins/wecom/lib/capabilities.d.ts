import type { DiscoveredMethod } from './discovery.ts';
import { type WeComRunRequest, type WeComRunResult } from './transport.ts';
interface Runner {
    run(request: WeComRunRequest): Promise<WeComRunResult>;
}
export interface CapabilityFilterResult {
    readonly methods: readonly DiscoveredMethod[];
    readonly warnings: readonly string[];
}
/** Remove only API families proven permanently unavailable by a read-only probe. */
export declare function filterAvailableMethods(methods: readonly DiscoveredMethod[], runner: Runner, now?: () => Date): Promise<CapabilityFilterResult>;
export {};

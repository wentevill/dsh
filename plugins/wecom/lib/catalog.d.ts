import type { DiscoveredMethod } from './discovery.ts';
import { type AdaptedParameter } from './schema-adapter.ts';
/** Complete model-tool candidate produced from one discovered method. */
export interface DynamicToolDefinition {
    readonly name: string;
    readonly description: string;
    readonly parameters: Readonly<Record<string, AdaptedParameter>>;
    readonly method: DiscoveredMethod;
}
/** Atomic installation seam implemented by the Host with one child plugin generation. */
export interface DynamicToolInstaller {
    install(definitions: readonly DynamicToolDefinition[]): () => void;
}
/** Own the last-good dynamic tool generation and replace it only after candidate installation. */
export declare function createDynamicToolCatalog(installer: DynamicToolInstaller): {
    refresh(methods: readonly DiscoveredMethod[]): Promise<number>;
    clear(): Promise<void>;
    size(): number;
};

import { type AuthBackend } from './auth.ts';
import { type DynamicToolDefinition } from './catalog.ts';
import type { WeComRunRequest, WeComRunResult } from './transport.ts';
interface HostOptions {
    readonly authBackend: AuthBackend;
    readonly runner: {
        run(request: WeComRunRequest): Promise<WeComRunResult>;
    };
    readonly installTools: (definitions: readonly DynamicToolDefinition[]) => () => void;
}
/** Compose authorization, discovery, and last-good dynamic tool ownership. */
export declare function createWeComHost(options: HostOptions): {
    auth: {
        snapshot(): import("./remote-types.ts").WeComAuthSnapshot;
        subscribe(listener: (snapshot: import("./remote-types.ts").WeComAuthSnapshot) => void): () => void;
        initialize(): Promise<void>;
        connect(): Promise<void>;
        cancel(): void;
        refresh(): Promise<void>;
        deleteAuthorization(confirmed: boolean): Promise<void>;
    };
    catalog: {
        refresh(methods: readonly import("./discovery.ts").DiscoveredMethod[]): Promise<number>;
        clear(): Promise<void>;
        size(): number;
    };
    initialize: () => Promise<void>;
};
export {};

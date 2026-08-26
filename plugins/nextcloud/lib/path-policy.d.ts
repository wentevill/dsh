export type AccessMode = 'all' | 'allowlist';
export interface PathPolicySettings {
    readonly accessMode: AccessMode;
    readonly allowedRoots: readonly string[];
}
export declare function normalizeRemotePath(input: string): string;
export interface PathPolicy {
    readonly roots: readonly string[];
    assertAllowed(path: string): string;
    assertMove(source: string, destination: string): {
        source: string;
        destination: string;
    };
    assertDeletable(path: string): string;
}
export declare function createPathPolicy(settings: PathPolicySettings): PathPolicy;

import type { JsonValue } from './transport.ts';
import type { WeComJsonSchema } from './discovery.ts';
/** DSH parameter declaration assembled without importing a Host runtime. */
export interface AdaptedParameter {
    readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    readonly required?: boolean;
    readonly description?: string;
    readonly enum?: readonly JsonValue[];
    readonly properties?: Readonly<Record<string, AdaptedParameter>>;
    readonly items?: AdaptedParameter;
    readonly additionalProperties?: boolean;
}
/** Produce a stable model-facing name from a remote method path. */
export declare function normalizeToolName(path: readonly string[]): string;
/** Resolve and convert one request schema into DSH root parameters. */
export declare function adaptRequestSchema(requestRef: string | undefined, schemas: Readonly<Record<string, WeComJsonSchema>>): Readonly<Record<string, AdaptedParameter>>;

import type { JsonValue, WeComRunRequest, WeComRunResult } from './transport.ts';
/** JSON Schema subset emitted by wecom-cli schema get. */
export interface WeComJsonSchema {
    readonly type?: string;
    readonly description?: string;
    readonly properties?: Readonly<Record<string, WeComJsonSchema>>;
    readonly required?: readonly string[];
    readonly items?: WeComJsonSchema;
    readonly enum?: readonly JsonValue[];
    readonly oneOf?: readonly WeComJsonSchema[];
    readonly additionalProperties?: boolean | WeComJsonSchema;
    readonly [key: string]: unknown;
}
/** Fully expanded remote method ready for policy and tool adaptation. */
export interface DiscoveredMethod {
    readonly path: readonly string[];
    readonly description?: string;
    readonly requestRef?: string;
    readonly responseRef: string;
    readonly schemas: Readonly<Record<string, WeComJsonSchema>>;
}
interface Runner {
    run(request: WeComRunRequest): Promise<WeComRunResult>;
}
/** Expand schema list summaries with schema get for every advertised method. */
export declare function discoverWeComMethods(runner: Runner): Promise<readonly DiscoveredMethod[]>;
export {};

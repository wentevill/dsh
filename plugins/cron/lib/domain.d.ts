import { z } from 'zod';
import { CronExecutionId, CronId } from './brand.ts';
import type { CronDefinition, CronExecution, CronOccurrence, CronRuntimeState } from './types.ts';
/** Strict durable definition schema excluding impossible execution targets. */
export declare const cronDefinitionSchema: z.ZodType<CronDefinition>;
/** Strict durable occurrence schema. */
export declare const cronOccurrenceSchema: z.ZodType<CronOccurrence>;
/** Strict durable runtime schema. */
export declare const cronRuntimeStateSchema: z.ZodType<CronRuntimeState>;
/** Strict durable execution history schema. */
export declare const cronExecutionSchema: z.ZodType<CronExecution>;
/** Plugin-owned storage domain. */
export declare const cronDomainSpec: {
    name: string;
    version: number;
    tables: {
        definitions: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<CronId, CronDefinition>;
        runtime: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<CronId, CronRuntimeState>;
        executions: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<CronExecutionId, CronExecution>;
    };
};

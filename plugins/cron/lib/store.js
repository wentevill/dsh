import { z } from 'zod';
import { cronDefinitionSchema, cronDomainSpec, cronExecutionSchema, cronRuntimeStateSchema, } from "./domain.js";
/** Bounded error raised by durable store invariants. */
export class CronStoreError extends Error {
    code;
    name = 'CronStoreError';
    constructor(code) {
        super(code);
        this.code = code;
    }
}
const cursorSchema = z.object({
    finishedAt: z.string(),
    id: z.string().min(1),
}).strict();
const terminalStates = new Set([
    'succeeded', 'failed', 'cancelled', 'coalesced',
]);
/** Durable Cron storage over one plugin-owned storage domain. */
export class CronStore {
    domain;
    definitions;
    runtime;
    executions;
    constructor(domain) {
        this.domain = domain;
        this.definitions = domain.table('definitions');
        this.runtime = domain.table('runtime');
        this.executions = domain.table('executions');
    }
    static async open(ctx) {
        return new CronStore(await ctx.storageDomain.open(cronDomainSpec));
    }
    async createDefinition(definition) {
        const value = cronDefinitionSchema.parse(definition);
        if (this.definitions.get(value.id) !== undefined) {
            throw new CronStoreError('duplicate_definition');
        }
        await this.definitions.put(value.id, value);
        return value;
    }
    async updateDefinition(id, expectedRevision, change) {
        return this.definitions.update(id, (current) => {
            if (current.revision !== expectedRevision) {
                throw new CronStoreError('revision_conflict');
            }
            if (current.state === 'deleted') {
                throw new CronStoreError('definition_deleted');
            }
            const changed = cronDefinitionSchema.parse(change(current));
            assertImmutableIdentity(current, changed);
            return cronDefinitionSchema.parse({
                ...changed,
                revision: current.revision + 1,
            });
        });
    }
    async putRuntime(runtime) {
        const value = cronRuntimeStateSchema.parse(runtime);
        await this.runtime.put(value.cronId, value);
        return value;
    }
    async beginExecution(execution) {
        const value = cronExecutionSchema.parse(execution);
        if (this.executions.get(value.id) !== undefined) {
            throw new CronStoreError('duplicate_execution');
        }
        await this.executions.put(value.id, value);
        return value;
    }
    async updateExecution(id, change) {
        return this.executions.update(id, (current) => {
            const next = cronExecutionSchema.parse(change(current));
            if (next.id !== current.id || next.cronId !== current.cronId) {
                throw new CronStoreError('immutable_identity');
            }
            return next;
        });
    }
    async finishExecution(id, state, patch) {
        return this.executions.update(id, current => cronExecutionSchema.parse({
            ...current,
            ...patch,
            state,
        }));
    }
    listDefinitions(scope = 'all') {
        return [...this.definitions.entries()]
            .map(([, definition]) => definition)
            .filter(definition => scope === 'all' || definition.state === scope)
            .sort(compareDefinition);
    }
    listHistory(query = {}) {
        const limit = query.limit ?? 50;
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            throw new CronStoreError('invalid_cursor');
        }
        const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
        const sorted = [...this.executions.entries()]
            .map(([, execution]) => execution)
            .filter(execution => query.cronId === undefined || execution.cronId === query.cronId)
            .sort(compareExecution);
        const eligible = cursor === undefined
            ? sorted
            : sorted.filter(execution => compareExecutionToCursor(execution, cursor) > 0);
        const items = eligible.slice(0, limit);
        const nextCursor = eligible.length > limit
            ? encodeCursor(items.at(-1))
            : undefined;
        return nextCursor === undefined ? { items } : { items, nextCursor };
    }
    recover() {
        const definitions = this.listDefinitions('all');
        const knownCronIds = new Set(definitions.map(definition => definition.id));
        const runtime = [...this.runtime.entries()]
            .map(([, value]) => value)
            .sort((left, right) => left.cronId.localeCompare(right.cronId));
        const executions = [...this.executions.entries()]
            .map(([, value]) => value)
            .filter(value => !terminalStates.has(value.state))
            .sort(compareExecution);
        return {
            activeDefinitions: definitions.filter(definition => definition.state === 'active'),
            runtime,
            nonterminalExecutions: executions,
            orphanRuntime: runtime.filter(value => !knownCronIds.has(value.cronId)),
            orphanExecutions: executions.filter(value => !knownCronIds.has(value.cronId)),
        };
    }
    close() {
        return this.domain.close();
    }
}
function assertImmutableIdentity(current, next) {
    if (current.id !== next.id
        || current.workspaceId !== next.workspaceId
        || current.createdFromSessionId !== next.createdFromSessionId
        || current.createdAt !== next.createdAt) {
        throw new CronStoreError('immutable_identity');
    }
}
function compareDefinition(left, right) {
    return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}
function executionTime(execution) {
    return execution.finishedAt ?? execution.startedAt ?? execution.scheduledFor ?? '';
}
function compareExecution(left, right) {
    return executionTime(right).localeCompare(executionTime(left)) || right.id.localeCompare(left.id);
}
function compareExecutionToCursor(execution, cursor) {
    return cursor.finishedAt.localeCompare(executionTime(execution)) || cursor.id.localeCompare(execution.id);
}
function encodeCursor(execution) {
    return Buffer.from(JSON.stringify({
        finishedAt: executionTime(execution),
        id: execution.id,
    }), 'utf8').toString('base64url');
}
function decodeCursor(encoded) {
    try {
        const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
        const cursor = cursorSchema.parse(JSON.parse(decoded));
        if (Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url') !== encoded) {
            throw new Error('non-canonical cursor');
        }
        return cursor;
    }
    catch {
        throw new CronStoreError('invalid_cursor');
    }
}

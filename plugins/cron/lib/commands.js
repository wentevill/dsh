import { randomUUID } from 'node:crypto';
import { CronId } from "./brand.js";
import { cronFailure } from "./errors.js";
import { CronStoreError } from "./store.js";
import { canonicalTimeZone } from "./timezone.js";
import { workspaceForSession } from "./workspace.js";
const noopLifecycle = { changed: async () => { } };
/** Workspace-authorized entry point shared by Tools and Client Remotes. */
export class CronCommandService {
    dependencies;
    lifecycle;
    createId;
    now;
    tails = new Map();
    constructor(dependencies) {
        this.dependencies = dependencies;
        this.lifecycle = dependencies.lifecycle ?? noopLifecycle;
        this.createId = dependencies.createId ?? (() => CronId(randomUUID()));
        this.now = dependencies.now ?? (() => new Date());
    }
    async create(sessionId, input) {
        const workspace = workspaceForSession(this.dependencies.workspaceRegistry, sessionId);
        const normalized = normalizeFields(input);
        this.assertRule(normalized);
        const target = await this.captureTarget(sessionId, input.executionMode);
        const timestamp = this.now().toISOString();
        const definition = {
            id: this.createId(),
            workspaceId: workspace.id,
            ...normalized,
            ...target,
            createdFromSessionId: sessionId,
            state: 'active',
            revision: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        const created = await this.dependencies.store.createDefinition(definition);
        await this.lifecycle.changed(undefined, created, { clearPending: false });
        return created;
    }
    async update(sessionId, id, expectedRevision, input) {
        return this.enqueue(id, () => this.updateNow(sessionId, id, expectedRevision, input));
    }
    async updateNow(sessionId, id, expectedRevision, input) {
        const current = this.definitionFor(sessionId, id);
        const mode = input.executionMode ?? current.executionMode;
        const target = mode === current.executionMode
            ? undefined
            : await this.captureTarget(sessionId, mode);
        const normalized = normalizeFields({ ...current, ...input });
        this.assertRule(normalized);
        const updated = await this.dependencies.store.updateDefinition(id, expectedRevision, (value) => {
            if (target === undefined) {
                return { ...value, ...normalized, updatedAt: this.now().toISOString() };
            }
            const { targetSessionId: _target, agentPresetId: _preset, ...identity } = value;
            return {
                ...identity,
                ...normalized,
                ...target,
                updatedAt: this.now().toISOString(),
            };
        });
        await this.lifecycle.changed(current, updated, { clearPending: false });
        return updated;
    }
    pause(sessionId, id) {
        return this.enqueue(id, () => this.changeState(sessionId, id, 'paused', true));
    }
    resume(sessionId, id) {
        return this.enqueue(id, () => this.changeState(sessionId, id, 'active', false));
    }
    delete(sessionId, id) {
        return this.enqueue(id, () => this.changeState(sessionId, id, 'deleted', true));
    }
    async list(sessionId, scope) {
        const workspace = workspaceForSession(this.dependencies.workspaceRegistry, sessionId);
        const definitions = this.dependencies.store.listDefinitions()
            .filter(value => value.workspaceId === workspace.id);
        if (scope === 'deleted')
            return definitions.filter(value => value.state === 'deleted');
        const current = definitions.filter(value => value.state !== 'deleted');
        if (scope === 'all')
            return current;
        const historyIds = this.executionCronIdsFor(sessionId);
        return current.filter(value => value.createdFromSessionId === sessionId
            || (value.executionMode === 'existing_session' && value.targetSessionId === sessionId)
            || historyIds.has(value.id));
    }
    history(sessionId, id, query = {}) {
        this.definitionFor(sessionId, id, true);
        return this.dependencies.store.listHistory({ ...query, cronId: id });
    }
    async changeState(sessionId, id, state, clearPending) {
        const current = this.definitionFor(sessionId, id);
        try {
            const updated = await this.dependencies.store.updateDefinition(id, current.revision, value => ({
                ...value,
                state,
                updatedAt: this.now().toISOString(),
                ...(state === 'deleted' ? { deletedAt: this.now().toISOString() } : {}),
            }));
            await this.lifecycle.changed(current, updated, { clearPending });
            return updated;
        }
        catch (error) {
            if (error instanceof CronStoreError && error.code === 'definition_deleted') {
                throw cronFailure('cron_not_found');
            }
            throw error;
        }
    }
    definitionFor(sessionId, id, includeDeleted = false) {
        const workspace = workspaceForSession(this.dependencies.workspaceRegistry, sessionId);
        const definition = this.dependencies.store.listDefinitions().find(value => value.id === id);
        if (definition === undefined
            || definition.workspaceId !== workspace.id
            || (!includeDeleted && definition.state === 'deleted')) {
            throw cronFailure('cron_not_found');
        }
        return definition;
    }
    async captureTarget(sessionId, mode) {
        if (mode === 'existing_session') {
            return { executionMode: mode, targetSessionId: sessionId };
        }
        const resolved = await this.dependencies.sessionController.resolveAgent(sessionId);
        if ('error' in resolved)
            throw cronFailure('target_session_unavailable');
        const preset = this.dependencies.agentPresets.composedPreset(resolved.agent.ctx);
        if (preset === undefined || preset.length === 0)
            throw cronFailure('agent_preset_unavailable');
        return { executionMode: mode, agentPresetId: preset };
    }
    assertRule(rule) {
        const canonical = canonicalTimeZone(rule.timezone);
        if (canonical !== rule.timezone)
            throw cronFailure('invalid_timezone');
        const validation = this.dependencies.library.validate(rule);
        if (!validation.ok)
            throw cronFailure(validation.code);
    }
    executionCronIdsFor(sessionId) {
        const ids = new Set();
        let cursor;
        do {
            const page = this.dependencies.store.listHistory({ limit: 100, ...(cursor === undefined ? {} : { cursor }) });
            for (const execution of page.items) {
                if (execution.sessionId === sessionId)
                    ids.add(execution.cronId);
            }
            cursor = page.nextCursor;
        } while (cursor !== undefined);
        return ids;
    }
    enqueue(id, operation) {
        const prior = this.tails.get(id) ?? Promise.resolve();
        const result = prior.then(operation, operation);
        const tail = result.then(() => { }, () => { });
        this.tails.set(id, tail);
        void tail.then(() => {
            if (this.tails.get(id) === tail)
                this.tails.delete(id);
        });
        return result;
    }
}
function normalizeFields(input) {
    return {
        name: input.name.trim(),
        expression: input.expression.trim().replace(/\s+/gu, ' '),
        timezone: input.timezone.trim(),
        prompt: input.prompt.trim(),
    };
}

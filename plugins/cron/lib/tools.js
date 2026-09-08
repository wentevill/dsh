import { defineTool } from '@deepseek-ai/dsh-tools';
import { CronId } from "./brand.js";
import { CronFailure } from "./errors.js";
import { CronStoreError } from "./store.js";
import { timezoneForOpenTurn } from "./timezone.js";
const mode = { type: 'string', enum: ['existing_session', 'new_session'] };
const scope = { type: 'string', enum: ['related', 'all', 'deleted'] };
const cronId = { type: 'string' };
const limit = { type: 'integer' };
const cursor = { type: 'string' };
const fieldParameters = {
    name: { type: 'string' }, expression: { type: 'string' }, timezone: { type: 'string' },
    prompt: { type: 'string' }, executionMode: mode,
};
const errorSchema = {
    type: 'object', additionalProperties: false,
    properties: { code: { type: 'string', required: true } },
};
const failureSchema = {
    type: 'object', additionalProperties: false,
    properties: {
        ok: { type: 'boolean', const: false, required: true },
        error: { ...errorSchema, required: true },
    },
};
const definitionSchema = {
    type: 'object', additionalProperties: false,
    properties: {
        id: { type: 'string', required: true }, name: { type: 'string', required: true },
        expression: { type: 'string', required: true }, timezone: { type: 'string', required: true },
        executionMode: { ...mode, required: true },
        state: { type: 'string', enum: ['active', 'paused', 'deleted'], required: true },
        revision: { type: 'integer', required: true },
    },
};
const mutationOutput = {
    oneOf: [
        {
            type: 'object', additionalProperties: false,
            properties: {
                ok: { type: 'boolean', const: true, required: true },
                cron: { ...definitionSchema, required: true },
            },
        },
        failureSchema,
    ],
};
const render = (_args, value) => [{ type: 'text', text: JSON.stringify(value) }];
/** Build the complete model-facing Cron tool set. */
export function createCronTools(commands) {
    const definitions = [
        defineTool({
            name: 'cron_list', description: 'List Cron tasks in the current Workspace.',
            parameters: { scope, limit },
            output: {
                schema: { oneOf: [{
                            type: 'object', additionalProperties: false,
                            properties: {
                                ok: { type: 'boolean', const: true, required: true },
                                items: { type: 'array', items: definitionSchema, required: true },
                            },
                        }, failureSchema] }, render,
            },
            async execute(args, exec) {
                return outcome(exec, async (sessionId) => {
                    const pageLimit = boundedLimit(args.limit);
                    const items = await commands.list(sessionId, (args.scope ?? 'related'));
                    return { ok: true, items: items.slice(0, pageLimit).map(definitionSummary) };
                });
            },
        }),
        defineTool({
            name: 'cron_history', description: 'List execution history for one Cron task.',
            parameters: { cronId: { ...cronId, required: true }, cursor, limit },
            output: {
                schema: { oneOf: [{
                            type: 'object', additionalProperties: false,
                            properties: {
                                ok: { type: 'boolean', const: true, required: true },
                                items: { type: 'array', items: executionSchema, required: true },
                                nextCursor: { type: 'string' },
                            },
                        }, failureSchema] }, render,
            },
            async execute(args, exec) {
                return outcome(exec, async (sessionId) => {
                    const page = commands.history(sessionId, CronId(args.cronId), {
                        limit: boundedLimit(args.limit),
                        ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
                    });
                    return {
                        ok: true,
                        items: page.items.map(executionSummary),
                        ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
                    };
                });
            },
        }),
        defineTool({
            name: 'cron_open_manager', description: 'Suggest opening the Cron manager in this conversation.',
            parameters: {},
            output: {
                schema: { oneOf: [suggestionSchema, failureSchema] }, render,
            },
            async execute(_args, exec) {
                const sessionId = invokingSession(exec);
                return sessionId === undefined
                    ? failure('workspace_context_unavailable')
                    : { kind: 'cron-manager-suggestion', scope: 'related', sessionId };
            },
        }),
        defineTool({
            name: 'cron_create', description: 'Create a persistent Cron task in the current Workspace.',
            parameters: {
                name: { type: 'string', required: true },
                expression: { type: 'string', required: true },
                timezone: { type: 'string' },
                prompt: { type: 'string', required: true },
                executionMode: { ...mode, required: true },
            },
            output: { schema: mutationOutput, render },
            async execute(args, exec) {
                return outcome(exec, async (sessionId) => {
                    const timezone = args.timezone ?? timezoneForOpenTurn(exec.agent.session.events);
                    const created = await commands.create(sessionId, { ...args, timezone });
                    return { ok: true, cron: definitionSummary(created) };
                });
            },
        }),
        defineTool({
            name: 'cron_update', description: 'Update one Cron task in the current Workspace.',
            parameters: {
                cronId: { ...cronId, required: true }, revision: { type: 'integer', required: true },
                ...fieldParameters,
            },
            output: { schema: mutationOutput, render },
            async execute(args, exec) {
                return outcome(exec, async (sessionId) => {
                    const { cronId: id, revision, ...change } = args;
                    const updated = await commands.update(sessionId, CronId(id), revision, change);
                    return { ok: true, cron: definitionSummary(updated) };
                });
            },
        }),
        mutationTool('cron_pause', 'Pause one Cron task.', commands.pause.bind(commands)),
        mutationTool('cron_resume', 'Resume one Cron task.', commands.resume.bind(commands)),
        mutationTool('cron_delete', 'Delete one Cron task.', commands.delete.bind(commands)),
    ];
    return definitions.map(strictRoot);
}
const executionSchema = {
    type: 'object', additionalProperties: false,
    properties: {
        id: { type: 'string', required: true }, cronId: { type: 'string', required: true },
        trigger: { type: 'string', required: true }, state: { type: 'string', required: true },
        scheduledFor: { type: 'string' }, delayed: { type: 'boolean', required: true },
        failureCode: { type: 'string' }, startedAt: { type: 'string' }, finishedAt: { type: 'string' },
    },
};
const suggestionSchema = {
    type: 'object', additionalProperties: false,
    properties: {
        kind: { type: 'string', const: 'cron-manager-suggestion', required: true },
        scope: { type: 'string', const: 'related', required: true },
        sessionId: { type: 'string', required: true },
    },
};
function mutationTool(name, description, command) {
    return defineTool({
        name, description, parameters: { cronId: { ...cronId, required: true } },
        output: { schema: mutationOutput, render },
        async execute(args, exec) {
            return outcome(exec, async (sessionId) => ({
                ok: true, cron: definitionSummary(await command(sessionId, CronId(args.cronId))),
            }));
        },
    });
}
async function outcome(exec, operation) {
    const sessionId = invokingSession(exec);
    if (sessionId === undefined)
        return failure('workspace_context_unavailable');
    try {
        return await operation(sessionId);
    }
    catch (error) {
        if (error instanceof CronToolInputError)
            return failure('invalid_request');
        if (error instanceof CronFailure || error instanceof CronStoreError)
            return failure(error.code);
        return failure('internal_error');
    }
}
function invokingSession(exec) {
    return exec.agent?.session.id;
}
function boundedLimit(value) {
    const normalized = value ?? 50;
    if (!Number.isInteger(normalized) || normalized < 1 || normalized > 100) {
        throw new CronToolInputError();
    }
    return normalized;
}
class CronToolInputError extends Error {
}
function strictRoot(tool) {
    const parameters = tool.parameters;
    const allowed = new Set(Object.keys(parameters.properties ?? {}));
    return {
        ...tool,
        parameters: { ...tool.parameters, additionalProperties: false },
        async execute(args, exec) {
            if (typeof args !== 'object' || args === null || Array.isArray(args)) {
                throw new CronToolInputError();
            }
            for (const key of Object.keys(args)) {
                if (!allowed.has(key))
                    throw new CronToolInputError();
            }
            return tool.execute(args, exec);
        },
    };
}
function failure(code) {
    return { ok: false, error: { code } };
}
function definitionSummary(value) {
    return {
        id: value.id, name: value.name, expression: value.expression, timezone: value.timezone,
        executionMode: value.executionMode, state: value.state, revision: value.revision,
    };
}
function executionSummary(value) {
    return {
        id: value.id, cronId: value.cronId, trigger: value.trigger, state: value.state,
        delayed: value.delayed,
        ...(value.scheduledFor === undefined ? {} : { scheduledFor: value.scheduledFor }),
        ...(value.failureCode === undefined ? {} : { failureCode: value.failureCode }),
        ...(value.startedAt === undefined ? {} : { startedAt: value.startedAt }),
        ...(value.finishedAt === undefined ? {} : { finishedAt: value.finishedAt }),
    };
}

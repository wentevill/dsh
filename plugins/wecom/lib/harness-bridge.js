import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { installModelSelection } from '@deepseek-ai/dsh-agent';
import { RoomScheduler } from './room-scheduler.js';
export class HarnessBridgeError extends Error {
    code;
    constructor(code) {
        super(`WeCom Harness bridge: ${code}`);
        this.code = code;
        this.name = 'HarnessBridgeError';
    }
}
/** Build the production bridge boundary from Harness services. */
export function createHarnessBridgeRuntime(ctx, options) {
    const pending = new Map();
    const setupFor = async (presetId) => {
        const selection = ctx.agentDefaultModel.currentSelection();
        const presets = ctx.get('agentPresets');
        const resolvedPreset = presets === undefined ? undefined : (await presets.resolve(presetId)).id;
        return {
            selection,
            resolvedPreset,
            setup: async (agentCtx) => {
                const selected = { current: selection, assembled: undefined };
                installModelSelection(agentCtx, selected);
                if (presets !== undefined)
                    await presets.mount(agentCtx, resolvedPreset);
            },
        };
    };
    const createOrResume = async (sessionId, signal) => {
        const live = ctx.agents.get(sessionId);
        if (live)
            return { agent: live };
        const headers = await ctx.sessionPersistence.list();
        const header = headers.find(candidate => candidate.id === sessionId);
        if (header) {
            const inspected = await ctx.sessionPersistence.inspect(sessionId);
            if (inspected.meta.cwd !== undefined)
                await options.ensureWorkspace(inspected.meta.cwd);
            const composition = await setupFor(recordedPreset(inspected.meta, inspected.events));
            const handle = await ctx.agents.resume({
                resumeSessionId: sessionId,
                signal,
                agentOptions: composition.selection,
                setup: composition.setup,
            });
            return { agent: handle.agent, dispose: () => handle.dispose() };
        }
        const composition = await setupFor(undefined);
        const sessionCwd = options.workspaceFor(sessionId);
        await options.ensureWorkspace(sessionCwd);
        const handle = await ctx.agents.create({
            sessionId,
            signal,
            meta: {
                cwd: sessionCwd,
                ...composition.resolvedPreset === undefined ? {} : { agentPreset: composition.resolvedPreset },
            },
            agentOptions: composition.selection,
            setup: composition.setup,
        });
        return { agent: handle.agent, dispose: () => handle.dispose() };
    };
    return {
        async agentFor(sessionId, signal) {
            const live = ctx.agents.get(sessionId);
            if (live)
                return { agent: live };
            let operation = pending.get(sessionId);
            if (!operation) {
                operation = createOrResume(sessionId, signal).finally(() => pending.delete(sessionId));
                pending.set(sessionId, operation);
            }
            return operation;
        },
        async materializeContent(blocks, signal) {
            checkAbort(signal);
            const images = blocks.filter((block) => block.type === 'attachment' && block.mediaType === 'image');
            const saved = images.length === 0 ? [] : await ctx.attachments.saveImages(images.map(image => ({
                data: image.bytes,
                mediaType: detectImageMediaType(image.bytes),
                ...image.filename === undefined ? {} : { name: image.filename },
            })));
            checkAbort(signal);
            let imageIndex = 0;
            return blocks.map((block) => {
                if (block.type === 'text')
                    return block;
                if (block.mediaType === 'image')
                    return { type: 'image', attachment: saved[imageIndex++] };
                return { type: 'text', text: block.filename ? `[WeCom file: ${block.filename}]` : '[WeCom file]' };
            });
        },
        flush: async (session) => { await ctx.sessions.flush(session); },
    };
}
export class HarnessBridge {
    #scheduler;
    #roomSessions;
    #runtime;
    #reply;
    #createStreamId;
    #abort = new AbortController();
    #owned = new Set();
    #dispose;
    constructor(options) {
        this.#scheduler = options.scheduler;
        this.#roomSessions = options.roomSessions;
        this.#runtime = options.runtime;
        this.#reply = options.reply;
        this.#createStreamId = options.createStreamId;
    }
    handle(envelope, signal) {
        if (this.#abort.signal.aborted)
            return Promise.reject(new HarnessBridgeError('disposed'));
        const combined = AbortSignal.any([signal, this.#abort.signal]);
        const roomKey = `${envelope.botId}\0${envelope.room.kind}\0${envelope.room.id}`;
        return this.#scheduler.enqueue(roomKey, () => this.#run(envelope, combined));
    }
    dispose() {
        this.#dispose ??= this.#runDispose();
        return this.#dispose;
    }
    async #run(envelope, signal) {
        checkAbort(signal);
        const sessionId = await this.#roomSessions.resolve({
            botId: envelope.botId,
            kind: envelope.room.kind,
            id: envelope.room.id,
        });
        checkAbort(signal);
        const lease = await this.#runtime.agentFor(sessionId, signal);
        if (lease.dispose)
            this.#owned.add(lease.dispose);
        const content = await this.#runtime.materializeContent(envelope.content, signal);
        checkAbort(signal);
        const firstSeq = lease.agent.session.seq;
        lease.agent.followup(createUserMessage({ content, source: { kind: 'user' } }));
        await lease.agent.whenIdle();
        await this.#runtime.flush(lease.agent.session);
        checkAbort(signal);
        const outcome = summarize(lease.agent.session.events, firstSeq);
        if (outcome.reason !== 'completed')
            throw new HarnessBridgeError('turn-failed');
        if (outcome.text === '')
            throw new HarnessBridgeError('empty-response');
        try {
            await this.#reply(envelope.replyContext, this.#createStreamId(), outcome.text, true);
        }
        catch {
            throw new HarnessBridgeError('reply-failed');
        }
    }
    async #runDispose() {
        this.#abort.abort();
        this.#scheduler.abort();
        await this.#scheduler.drain();
        await Promise.allSettled([...this.#owned].map(dispose => dispose()));
        this.#owned.clear();
    }
}
function summarize(events, firstSeq) {
    let started = false;
    let text = '';
    let reason;
    for (const event of events) {
        if (event.seq < firstSeq)
            continue;
        if (event.type === 'turn/start') {
            started = true;
            continue;
        }
        if (!started)
            continue;
        if (event.type === 'assistant/message') {
            const next = event.data.message.content
                .filter(block => block.type === 'text')
                .map(block => block.text)
                .join('');
            if (next !== '')
                text = next;
        }
        if (event.type === 'turn/end')
            reason = event.data.reason.kind;
    }
    return { text, reason };
}
function checkAbort(signal) {
    if (signal.aborted)
        throw new HarnessBridgeError('aborted');
}
function recordedPreset(header, events) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (event?.type === 'agent-preset/selected')
            return event.data.agentPreset;
    }
    return header.agentPreset;
}
function detectImageMediaType(bytes) {
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
        return 'image/png';
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
        return 'image/jpeg';
    if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)).startsWith('GIF8'))
        return 'image/gif';
    if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
        && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP')
        return 'image/webp';
    throw new HarnessBridgeError('turn-failed');
}

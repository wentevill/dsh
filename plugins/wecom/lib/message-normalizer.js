export class InboundMessageError extends Error {
    code;
    constructor(code) {
        super(messageFor(code));
        this.code = code;
        this.name = 'InboundMessageError';
    }
}
function messageFor(code) {
    switch (code) {
        case 'invalid': return 'Invalid WeCom callback';
        case 'unsupported': return 'Unsupported WeCom message type';
        case 'too_large': return 'WeCom attachment exceeds configured limits';
        case 'timeout': return 'WeCom attachment download timed out';
        case 'aborted': return 'WeCom message handling was cancelled';
    }
}
const defaults = {
    maxAttachmentBytes: 10 * 1024 * 1024,
    maxTotalBytes: 20 * 1024 * 1024,
    downloadTimeoutMs: 15_000,
};
export async function normalizeInbound(input, options) {
    const frame = asFrame(input);
    const body = frame.body;
    const requestId = requiredString(frame.headers?.req_id);
    const messageId = requiredString(body.msgid);
    const botId = requiredString(body.aibotid);
    const sender = asRecord(body.from);
    const senderId = requiredString(sender?.userid);
    const chatType = requiredString(body.chattype);
    const room = chatType === 'single'
        ? { kind: 'direct', id: senderId }
        : chatType === 'group'
            ? { kind: 'group', id: requiredString(body.chatid) }
            : fail('invalid');
    const limits = { ...defaults, ...options.limits };
    const state = { totalBytes: 0 };
    const content = await normalizeContent(body, options, limits, state);
    return { requestId, messageId, botId, room, senderId, content, replyContext: input };
}
async function normalizeContent(body, options, limits, state) {
    const type = requiredString(body.msgtype);
    if (type === 'text' || type === 'voice') {
        const content = requiredString(asRecord(body[type])?.content);
        return [{ type: 'text', text: content }];
    }
    if (type === 'image' || type === 'file') {
        return [await downloadBlock(type, asRecord(body[type]), options, limits, state)];
    }
    if (type === 'mixed') {
        const items = asRecord(body.mixed)?.msg_item;
        if (!Array.isArray(items) || items.length === 0)
            fail('invalid');
        const blocks = [];
        for (const item of items) {
            const record = asRecord(item);
            const itemType = requiredString(record?.msgtype);
            if (itemType === 'text') {
                blocks.push({ type: 'text', text: requiredString(asRecord(record?.text)?.content) });
            }
            else if (itemType === 'image') {
                blocks.push(await downloadBlock('image', asRecord(record?.image), options, limits, state));
            }
            else {
                fail('unsupported');
            }
        }
        return blocks;
    }
    fail('unsupported');
}
async function downloadBlock(mediaType, media, options, limits, state) {
    const url = requiredString(media?.url);
    const aesKey = optionalString(media?.aeskey);
    const result = await boundedDownload(() => options.download(url, aesKey), limits.downloadTimeoutMs, options.signal);
    const bytes = new Uint8Array(result.buffer);
    if (bytes.byteLength > limits.maxAttachmentBytes)
        fail('too_large');
    state.totalBytes += bytes.byteLength;
    if (state.totalBytes > limits.maxTotalBytes)
        fail('too_large');
    return { type: 'attachment', mediaType, bytes, filename: result.filename };
}
async function boundedDownload(start, timeoutMs, signal) {
    if (signal?.aborted)
        fail('aborted');
    let timer;
    let abortListener;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new InboundMessageError('timeout')), timeoutMs);
    });
    const aborted = new Promise((_, reject) => {
        if (!signal)
            return;
        abortListener = () => reject(new InboundMessageError('aborted'));
        signal.addEventListener('abort', abortListener, { once: true });
    });
    try {
        return await Promise.race([start(), timeout, aborted]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
        if (signal && abortListener)
            signal.removeEventListener('abort', abortListener);
    }
}
function asFrame(value) {
    const record = asRecord(value);
    if (!record || !asRecord(record.headers) || !asRecord(record.body))
        fail('invalid');
    return record;
}
function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function requiredString(value) {
    if (typeof value !== 'string' || value.length === 0)
        fail('invalid');
    return value;
}
function optionalString(value) {
    if (value === undefined)
        return undefined;
    return requiredString(value);
}
function fail(code) {
    throw new InboundMessageError(code);
}

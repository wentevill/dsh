import { WSAuthFailureError, WSClient, WSReconnectExhaustedError, } from '@wecom/aibot-node-sdk';
export function categorizeSdkError(error) {
    let category = 'permanent';
    if (error instanceof WSAuthFailureError || hasCategory(error, 'auth'))
        category = 'auth';
    else if (error instanceof WSReconnectExhaustedError || hasCategory(error, 'network'))
        category = 'network';
    else if (hasCategory(error, 'timeout') || isTimeout(error))
        category = 'timeout';
    const projected = new Error(safeErrorMessage(category));
    Object.defineProperty(projected, 'category', { value: category, enumerable: true });
    return projected;
}
function hasCategory(error, category) {
    return typeof error === 'object' && error !== null && 'category' in error
        && error.category === category;
}
function isTimeout(error) {
    return error instanceof Error && /timeout|timed out/i.test(error.name);
}
function safeErrorMessage(category) {
    switch (category) {
        case 'auth': return 'WeCom Bot authentication failed';
        case 'network': return 'WeCom WebSocket connection was interrupted';
        case 'timeout': return 'WeCom WebSocket operation timed out';
        default: return 'WeCom WebSocket operation failed';
    }
}
const silentLogger = {
    debug() { },
    info() { },
    warn() { },
    error() { },
};
export function createSdkClientFactory(options = {}) {
    const Client = options.Client ?? WSClient;
    return {
        create(credentials) {
            const client = new Client({
                botId: credentials.botId,
                secret: credentials.secret,
                maxReconnectAttempts: 0,
                maxAuthFailureAttempts: 0,
                maxReplyQueueSize: 32,
                requestTimeout: 10_000,
                heartbeatInterval: 30_000,
                logger: silentLogger,
            });
            return {
                connect: () => { client.connect(); },
                disconnect: () => { client.disconnect(); },
                on(event, listener) {
                    const projectedListener = (event === 'error'
                        ? ((error) => listener(categorizeSdkError(error)))
                        : listener);
                    client.on(event, projectedListener);
                    let active = true;
                    return () => {
                        if (!active)
                            return;
                        active = false;
                        client.off(event, projectedListener);
                    };
                },
                async reply(context, streamId, content, finish) {
                    await client.replyStream(context, streamId, content, finish);
                },
                async download(url, aesKey) {
                    const result = await client.downloadFile(url, aesKey);
                    return { buffer: new Uint8Array(result.buffer), filename: result.filename };
                },
            };
        },
    };
}

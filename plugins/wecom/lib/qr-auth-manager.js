export class QrAuthError extends Error {
    code;
    constructor(code) {
        super(`WeCom QR authorization: ${code}`);
        this.code = code;
        this.name = 'QrAuthError';
    }
}
export function createQrAuthManager(options) {
    const fetcher = options.fetch ?? ((url, init) => fetch(url, init));
    const now = options.now ?? Date.now;
    const pollIntervalMs = options.pollIntervalMs ?? 3000;
    const ttlMs = options.ttlMs ?? 5 * 60_000;
    const requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    const maxResponseBytes = options.maxResponseBytes ?? 64 * 1024;
    let active;
    async function request(url, signal) {
        const timeout = AbortSignal.timeout(requestTimeoutMs);
        const response = await fetcher(url, { method: 'GET', signal: AbortSignal.any([signal, timeout]) })
            .catch(() => { throw signal.aborted ? new QrAuthError('cancelled') : new QrAuthError('upstream'); });
        if (!response.ok)
            throw new QrAuthError('upstream');
        if (!response.body)
            throw new QrAuthError('invalid-response');
        const reader = response.body.getReader();
        const chunks = [];
        let bytes = 0;
        try {
            while (true) {
                const item = await reader.read();
                if (item.done)
                    break;
                bytes += item.value.byteLength;
                if (bytes > maxResponseBytes)
                    throw new QrAuthError('invalid-response');
                chunks.push(item.value);
            }
        }
        finally {
            reader.releaseLock();
        }
        const merged = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.byteLength;
        }
        try {
            const value = JSON.parse(new TextDecoder().decode(merged));
            if (typeof value !== 'object' || value === null)
                throw new Error();
            return value;
        }
        catch {
            throw new QrAuthError('invalid-response');
        }
    }
    return {
        async connect({ signal, onQr }) {
            active?.abort();
            const generation = new AbortController();
            active = generation;
            const combined = AbortSignal.any([signal, generation.signal]);
            const startedAt = now();
            try {
                const generate = new URL(options.generateUrl ?? 'https://work.weixin.qq.com/ai/qc/generate');
                generate.searchParams.set('source', 'dsh-wecom');
                generate.searchParams.set('plat', '0');
                const generated = await request(generate, combined);
                const scode = stringAt(generated, ['data', 'scode']);
                const authUrl = stringAt(generated, ['data', 'auth_url']);
                if (!scode || !authUrl)
                    throw new QrAuthError('invalid-response');
                onQr(await options.toQrDataUrl(authUrl));
                while (true) {
                    if (combined.aborted)
                        throw new QrAuthError('cancelled');
                    if (now() - startedAt >= ttlMs)
                        throw new QrAuthError('expired');
                    await delay(pollIntervalMs, combined);
                    const query = new URL(options.queryUrl ?? 'https://work.weixin.qq.com/ai/qc/query_result');
                    query.searchParams.set('scode', scode);
                    const result = await request(query, combined);
                    const status = stringAt(result, ['data', 'status'])?.toLowerCase();
                    if (['expired', 'expire', 'timeout', 'cancel', 'canceled', 'cancelled', 'invalid'].includes(status ?? '')) {
                        throw new QrAuthError('expired');
                    }
                    if (status !== 'success')
                        continue;
                    const botId = stringAt(result, ['data', 'bot_info', 'botid']);
                    const secret = stringAt(result, ['data', 'bot_info', 'secret']);
                    if (!botId || !secret)
                        throw new QrAuthError('invalid-response');
                    return { botId, secret };
                }
            }
            catch (error) {
                if (combined.aborted && !(error instanceof QrAuthError))
                    throw new QrAuthError('cancelled');
                throw error;
            }
            finally {
                if (active === generation)
                    active = undefined;
            }
        },
        cancel() { active?.abort(); },
    };
}
function stringAt(value, path) {
    let current = value;
    for (const part of path)
        current = current?.[part];
    return typeof current === 'string' && current.trim() !== '' ? current : undefined;
}
function delay(ms, signal) {
    if (signal.aborted)
        return Promise.reject(new QrAuthError('cancelled'));
    return new Promise((resolve, reject) => {
        const timer = setTimeout(finish, ms);
        function finish() { cleanup(); resolve(); }
        function abort() { cleanup(); reject(new QrAuthError('cancelled')); }
        function cleanup() { clearTimeout(timer); signal.removeEventListener('abort', abort); }
        signal.addEventListener('abort', abort, { once: true });
    });
}

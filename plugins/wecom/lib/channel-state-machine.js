const DELAYS = [1000, 2000, 4000, 8000, 15_000, 30_000];
export function createChannelController(options) {
    const listeners = new Set();
    const random = options.random ?? Math.random;
    const now = options.now ?? Date.now;
    const stableAfterMs = options.stableAfterMs ?? 30_000;
    let serial = 0;
    let active;
    let current = { state: 'stopped', attempt: 0 };
    function publish(state, patch = {}) {
        const next = { state, attempt: active?.attempt ?? 0, ...patch };
        if (next.nextRetryAt === undefined)
            delete next.nextRetryAt;
        if (next.error === undefined)
            delete next.error;
        current = next;
        for (const listener of listeners)
            listener(current);
    }
    function isActive(generation) {
        return active === generation && !generation.abort.signal.aborted;
    }
    function releaseTransport(generation) {
        for (const dispose of generation.disposers.splice(0))
            dispose();
        const client = generation.client;
        generation.client = undefined;
        client?.disconnect();
    }
    function clearRetry(generation) {
        if (generation.retryTimer)
            clearTimeout(generation.retryTimer);
        generation.retryTimer = undefined;
    }
    function clearStable(generation) {
        if (generation.stableTimer)
            clearTimeout(generation.stableTimer);
        generation.stableTimer = undefined;
    }
    async function stopGeneration(generation) {
        generation.abort.abort();
        clearRetry(generation);
        clearStable(generation);
        generation.networkDisposer?.();
        generation.networkDisposer = undefined;
        releaseTransport(generation);
        await Promise.allSettled(generation.operations);
    }
    function categoryOf(error) {
        const category = error.category;
        return category === 'auth' || category === 'network' || category === 'timeout'
            ? category
            : 'permanent';
    }
    function scheduleRetry(generation) {
        if (!isActive(generation) || generation.retryTimer)
            return;
        releaseTransport(generation);
        clearStable(generation);
        const nominal = DELAYS[Math.min(generation.attempt, DELAYS.length - 1)];
        generation.attempt += 1;
        const jitter = 0.8 + random() * 0.4;
        const delay = Math.min(30_000, Math.round(nominal * jitter));
        publish('reconnect_wait', { nextRetryAt: now() + delay });
        generation.retryTimer = setTimeout(() => {
            generation.retryTimer = undefined;
            connect(generation);
        }, delay);
    }
    function connect(generation) {
        if (!isActive(generation))
            return;
        clearRetry(generation);
        releaseTransport(generation);
        publish('connecting', { nextRetryAt: undefined, error: undefined });
        const client = options.factory.create(generation.credentials);
        generation.client = client;
        generation.disposers.push(client.on('connected', () => {
            if (isActive(generation) && generation.client === client)
                publish('subscribing');
        }), client.on('authenticated', () => {
            if (!isActive(generation) || generation.client !== client)
                return;
            publish('connected', { error: undefined, nextRetryAt: undefined });
            clearStable(generation);
            generation.stableTimer = setTimeout(() => {
                if (!isActive(generation) || generation.client !== client)
                    return;
                generation.attempt = 0;
                publish('connected');
            }, stableAfterMs);
        }), client.on('disconnected', reason => {
            queueMicrotask(() => {
                if (!isActive(generation) || generation.client !== client)
                    return;
                if (isConnectionConflict(reason)) {
                    releaseTransport(generation);
                    clearStable(generation);
                    publish('failed', {
                        error: { category: 'permanent', message: 'Another WeCom Bot connection is active' },
                    });
                    return;
                }
                scheduleRetry(generation);
            });
        }), client.on('error', error => {
            if (!isActive(generation) || generation.client !== client)
                return;
            const category = categoryOf(error);
            if (category === 'auth') {
                releaseTransport(generation);
                clearStable(generation);
                publish('auth_failed', { error: { category, message: 'WeCom Bot authentication failed' } });
            }
            else if (category === 'network' || category === 'timeout') {
                scheduleRetry(generation);
            }
            else {
                releaseTransport(generation);
                clearStable(generation);
                publish('failed', { error: { category, message: 'WeCom WebSocket operation failed' } });
            }
        }), client.on('message', frame => {
            if (!isActive(generation) || generation.client !== client)
                return;
            const operation = Promise.resolve(options.onMessage?.(frame, generation.abort.signal, client))
                .then(() => undefined, () => undefined);
            generation.operations.add(operation);
            void operation.finally(() => generation.operations.delete(operation));
        }));
        client.connect();
    }
    return {
        async start(credentials) {
            if (active)
                await stopGeneration(active);
            const generation = {
                id: ++serial,
                credentials,
                abort: new AbortController(),
                disposers: [],
                attempt: 0,
                operations: new Set(),
            };
            active = generation;
            generation.networkDisposer = options.subscribeNetworkRestored?.(() => {
                if (!isActive(generation) || !generation.retryTimer)
                    return;
                clearRetry(generation);
                connect(generation);
            });
            connect(generation);
        },
        async stop() {
            if (active)
                await stopGeneration(active);
            active = undefined;
            publish('stopped', { attempt: 0, nextRetryAt: undefined, error: undefined });
        },
        snapshot: () => current,
        subscribe(listener) {
            listeners.add(listener);
            listener(current);
            return () => listeners.delete(listener);
        },
    };
}
function isConnectionConflict(reason) {
    return /new connection (?:has been )?established|another .*connection/i.test(reason);
}

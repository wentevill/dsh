/** Stateful authorization controller shared by the Host Remote and tool catalog. */
export function createWeComAuthController(options) {
    let current = { state: 'unauthorized' };
    let active;
    const listeners = new Set();
    const publish = (snapshot) => {
        current = snapshot;
        for (const listener of listeners)
            listener(snapshot);
    };
    const refreshAuthorized = async (status) => {
        const identity = status.botId === undefined ? {} : { botId: status.botId };
        publish({ state: 'authorized', ...identity });
        publish({ state: 'refreshing_schema', ...identity });
        try {
            const toolCount = await options.refreshTools();
            publish({ state: 'ready', ...identity, toolCount });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'API synchronization failed';
            publish({ state: 'sync_failed', ...identity, message });
        }
    };
    const initialize = async () => {
        const status = await options.backend.status();
        if (!status.authorized) {
            await options.clearTools();
            publish({ state: 'unauthorized' });
            return;
        }
        await refreshAuthorized(status);
    };
    const connect = async () => {
        if (active !== undefined)
            throw new Error('authorization already in progress');
        const generation = new AbortController();
        active = generation;
        publish({ state: 'generating_qr' });
        try {
            await options.backend.connect({
                signal: generation.signal,
                onQr: qrDataUrl => { publish({ state: 'awaiting_scan', qrDataUrl }); },
            });
            if (generation.signal.aborted)
                return;
            const status = await options.backend.status();
            if (!status.authorized) {
                publish({ state: 'unauthorized' });
                return;
            }
            await refreshAuthorized(status);
        }
        catch (error) {
            if (!generation.signal.aborted) {
                const message = error instanceof Error ? error.message : 'authorization failed';
                publish({ state: 'sync_failed', message });
            }
        }
        finally {
            if (active === generation)
                active = undefined;
        }
    };
    return {
        snapshot: () => current,
        subscribe(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        initialize,
        connect,
        cancel() {
            active?.abort();
            publish({ state: 'unauthorized' });
        },
        async refresh() {
            const status = await options.backend.status();
            if (!status.authorized) {
                await options.clearTools();
                publish({ state: 'unauthorized' });
                return;
            }
            await refreshAuthorized(status);
        },
        async deleteAuthorization(confirmed) {
            if (!confirmed)
                throw new Error('authorization deletion confirmation required');
            active?.abort();
            const botId = 'botId' in current ? current.botId : undefined;
            publish(botId === undefined ? { state: 'deleting' } : { state: 'deleting', botId });
            await options.clearTools();
            await options.backend.deleteOwnedAuthorization();
            publish({ state: 'unauthorized' });
        },
    };
}

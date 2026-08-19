/** Replace same-named dynamic generations without duplicate registry writes. */
export function createGenerationInstaller(hooks) {
    let generation = 0;
    let entries = new Map();
    return items => {
        const nextGeneration = generation + 1;
        const previous = entries;
        for (const entry of [...previous.values()].reverse())
            entry.dispose();
        const candidate = new Map();
        try {
            for (const item of items) {
                const name = hooks.name(item);
                candidate.set(name, { item, dispose: hooks.register(item) });
            }
        }
        catch (error) {
            for (const entry of [...candidate.values()].reverse())
                entry.dispose();
            const restored = new Map();
            for (const [name, entry] of previous)
                restored.set(name, { item: entry.item, dispose: hooks.register(entry.item) });
            entries = restored;
            for (const entry of restored.values())
                hooks.activate(entry.item);
            throw error;
        }
        entries = candidate;
        for (const item of items)
            hooks.activate(item);
        generation = nextGeneration;
        return () => {
            if (generation !== nextGeneration)
                return;
            for (const entry of [...entries.values()].reverse())
                entry.dispose();
            entries.clear();
            generation += 1;
        };
    };
}

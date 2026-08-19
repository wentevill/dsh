/** Replace same-named dynamic generations without duplicate registry writes. */
export function createGenerationInstaller(hooks) {
    let generation = 0;
    let entries = new Map();
    return items => {
        const nextGeneration = generation + 1;
        const names = new Set(items.map(hooks.name));
        const added = new Map();
        try {
            for (const item of items) {
                const name = hooks.name(item);
                if (!entries.has(name))
                    added.set(name, hooks.register(item));
            }
        }
        catch (error) {
            for (const dispose of [...added.values()].reverse())
                dispose();
            throw error;
        }
        for (const [name, dispose] of entries) {
            if (!names.has(name))
                dispose();
        }
        entries = new Map([...entries].filter(([name]) => names.has(name)));
        for (const [name, dispose] of added)
            entries.set(name, dispose);
        for (const item of items)
            hooks.activate(item);
        generation = nextGeneration;
        return () => {
            if (generation !== nextGeneration)
                return;
            for (const dispose of [...entries.values()].reverse())
                dispose();
            entries.clear();
            generation += 1;
        };
    };
}

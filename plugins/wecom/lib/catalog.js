import { adaptRequestSchema, normalizeToolName } from "./schema-adapter.js";
function buildDefinitions(methods) {
    const definitions = methods.map(method => ({
        name: normalizeToolName(method.path),
        description: method.description ?? `Call WeCom ${method.path.join('.')}`,
        parameters: adaptRequestSchema(method.requestRef, method.schemas),
        method,
    }));
    const names = new Set();
    for (const definition of definitions) {
        if (names.has(definition.name))
            throw new Error(`duplicate WeCom tool name: ${definition.name}`);
        names.add(definition.name);
    }
    return definitions;
}
/** Own the last-good dynamic tool generation and replace it only after candidate installation. */
export function createDynamicToolCatalog(installer) {
    let dispose;
    let count = 0;
    return {
        async refresh(methods) {
            const definitions = buildDefinitions(methods);
            const nextDispose = installer.install(definitions);
            const previous = dispose;
            dispose = nextDispose;
            count = definitions.length;
            previous?.();
            return count;
        },
        async clear() {
            const previous = dispose;
            dispose = undefined;
            count = 0;
            previous?.();
        },
        size: () => count,
    };
}

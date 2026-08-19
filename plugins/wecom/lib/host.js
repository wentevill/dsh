import { createWeComAuthController } from "./auth.js";
import { filterAvailableMethods } from "./capabilities.js";
import { createDynamicToolCatalog } from "./catalog.js";
import { discoverWeComMethods } from "./discovery.js";
/** Compose authorization, discovery, and last-good dynamic tool ownership. */
export function createWeComHost(options) {
    const catalog = createDynamicToolCatalog({ install: options.installTools });
    const auth = createWeComAuthController({
        backend: options.authBackend,
        refreshTools: async () => {
            const discovered = await discoverWeComMethods(options.runner);
            const available = await filterAvailableMethods(discovered, options.runner);
            return catalog.refresh(available.methods);
        },
        clearTools: () => catalog.clear(),
    });
    return {
        auth,
        catalog,
        initialize: () => auth.initialize(),
    };
}

import { createWeComAuthController } from "./auth.js";
import { createDynamicToolCatalog } from "./catalog.js";
import { discoverWeComMethods } from "./discovery.js";
/** Compose authorization, discovery, and last-good dynamic tool ownership. */
export function createWeComHost(options) {
    const catalog = createDynamicToolCatalog({ install: options.installTools });
    const auth = createWeComAuthController({
        backend: options.authBackend,
        refreshTools: async () => catalog.refresh(await discoverWeComMethods(options.runner)),
        clearTools: () => catalog.clear(),
    });
    return {
        auth,
        catalog,
        initialize: () => auth.initialize(),
    };
}

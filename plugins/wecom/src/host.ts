import { createWeComAuthController, type AuthBackend } from './auth.ts'
import { filterAvailableMethods } from './capabilities.ts'
import { createDynamicToolCatalog, type DynamicToolDefinition } from './catalog.ts'
import { discoverWeComMethods } from './discovery.ts'
import type { WeComRunRequest, WeComRunResult } from './transport.ts'

interface HostOptions {
  readonly authBackend: AuthBackend
  readonly runner: { run(request: WeComRunRequest): Promise<WeComRunResult> }
  readonly installTools: (definitions: readonly DynamicToolDefinition[]) => () => void
}

/** Compose authorization, discovery, and last-good dynamic tool ownership. */
export function createWeComHost(options: HostOptions) {
  const catalog = createDynamicToolCatalog({ install: options.installTools })
  const auth = createWeComAuthController({
    backend: options.authBackend,
    refreshTools: async () => {
      const discovered = await discoverWeComMethods(options.runner)
      const available = await filterAvailableMethods(discovered, options.runner)
      return catalog.refresh(available.methods)
    },
    clearTools: () => catalog.clear(),
  })
  return {
    auth,
    catalog,
    initialize: () => auth.initialize(),
  }
}

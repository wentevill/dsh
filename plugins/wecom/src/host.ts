import { createWeComAuthController, type AuthBackend } from './auth.ts'
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
    refreshTools: async () => catalog.refresh(await discoverWeComMethods(options.runner)),
    clearTools: () => catalog.clear(),
  })
  return {
    auth,
    catalog,
    initialize: () => auth.initialize(),
  }
}

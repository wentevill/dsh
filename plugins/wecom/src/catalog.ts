import type { DiscoveredMethod } from './discovery.ts'
import { adaptRequestSchema, normalizeToolName, type AdaptedParameter } from './schema-adapter.ts'

/** Complete model-tool candidate produced from one discovered method. */
export interface DynamicToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Readonly<Record<string, AdaptedParameter>>
  readonly method: DiscoveredMethod
}

/** Atomic installation seam implemented by the Host with one child plugin generation. */
export interface DynamicToolInstaller {
  install(definitions: readonly DynamicToolDefinition[]): () => void
}

function buildDefinitions(methods: readonly DiscoveredMethod[]): readonly DynamicToolDefinition[] {
  const definitions = methods.map(method => ({
    name: normalizeToolName(method.path),
    description: method.description ?? `Call WeCom ${method.path.join('.')}`,
    parameters: adaptRequestSchema(method.requestRef, method.schemas),
    method,
  }))
  const names = new Set<string>()
  for (const definition of definitions) {
    if (names.has(definition.name)) throw new Error(`duplicate WeCom tool name: ${definition.name}`)
    names.add(definition.name)
  }
  return definitions
}

/** Own the last-good dynamic tool generation and replace it only after candidate installation. */
export function createDynamicToolCatalog(installer: DynamicToolInstaller): {
  refresh(methods: readonly DiscoveredMethod[]): Promise<number>
  clear(): Promise<void>
  size(): number
} {
  let dispose: (() => void) | undefined
  let count = 0
  return {
    async refresh(methods) {
      const definitions = buildDefinitions(methods)
      const nextDispose = installer.install(definitions)
      const previous = dispose
      dispose = nextDispose
      count = definitions.length
      previous?.()
      return count
    },
    async clear() {
      const previous = dispose
      dispose = undefined
      count = 0
      previous?.()
    },
    size: () => count,
  }
}

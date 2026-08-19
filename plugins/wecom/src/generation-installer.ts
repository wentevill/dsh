interface GenerationHooks<T> {
  readonly name: (item: T) => string
  readonly register: (item: T) => () => void
  readonly activate: (item: T) => void
}

/** Replace same-named dynamic generations without duplicate registry writes. */
export function createGenerationInstaller<T>(hooks: GenerationHooks<T>): (items: readonly T[]) => () => void {
  let generation = 0
  let entries = new Map<string, { item: T; dispose: () => void }>()
  return items => {
    const nextGeneration = generation + 1
    const previous = entries
    for (const entry of [...previous.values()].reverse()) entry.dispose()
    const candidate = new Map<string, { item: T; dispose: () => void }>()
    try {
      for (const item of items) {
        const name = hooks.name(item)
        candidate.set(name, { item, dispose: hooks.register(item) })
      }
    } catch (error) {
      for (const entry of [...candidate.values()].reverse()) entry.dispose()
      const restored = new Map<string, { item: T; dispose: () => void }>()
      for (const [name, entry] of previous) restored.set(name, { item: entry.item, dispose: hooks.register(entry.item) })
      entries = restored
      for (const entry of restored.values()) hooks.activate(entry.item)
      throw error
    }
    entries = candidate
    for (const item of items) hooks.activate(item)
    generation = nextGeneration
    return () => {
      if (generation !== nextGeneration) return
      for (const entry of [...entries.values()].reverse()) entry.dispose()
      entries.clear()
      generation += 1
    }
  }
}

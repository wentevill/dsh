import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    include: ['scripts/**/*.spec.ts', 'tests/**/*.spec.ts', 'tests/**/*.e2e.ts'],
  },
})

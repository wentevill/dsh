/**
 * Client-bundle emitter for dsh-mail-plugin.
 *
 * Reuses the harness client preset's platform table ({@link CLIENT_EXTERNALS})
 * so the browser bundle resolves its externals against the loader module table
 * exactly like every shipped `dsh.client` package (react/cordis/ui-slots share
 * the frozen instances; `@deepseek-ai/dsh-client-runtime/client` rides its
 * documented store-engine exemption), bundles everything else inline, and lands
 * in `lib/client.js` as a `window.__ModuleLoader__.load({ id, factory })`
 * closure-factory artifact served at `/plugins/dsh-mail-plugin/client.js`.
 *
 * This config emits ONLY the client bundle; the node half (`lib/index.js`, …)
 * is produced by the plain `tsc -p tsconfig.build.json` host build.
 */
import type { UserConfig } from 'tsdown'
import { CLIENT_EXTERNALS } from '../../deepseek-harness/deepseek-harness/packages/client/tsdown.client.ts'

/** Must match the package name — the boot-graph entry id the browser correlates the load with. */
const PLUGIN_ID = 'dsh-mail-plugin'

const NODE_ENV = process.env.NODE_ENV ?? 'production'

export default {
  name: `${PLUGIN_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  // A default clean would wipe the tsc-built node half emitted next to client.js.
  clean: false,
  sourcemap: true,
  // Externals resolved from the loader module table (platform seed + the store
  // engine's runtime exemption). Everything else is inlined below.
  external: [...CLIENT_EXTERNALS],
  define: {
    'process.env.NODE_ENV': JSON.stringify(NODE_ENV),
    'import.meta.env.MODE': JSON.stringify(NODE_ENV),
    'import.meta.env': JSON.stringify({ MODE: NODE_ENV }),
  },
  // Inline every non-shared dependency; a require() the frozen table cannot
  // answer is a guaranteed runtime throw, so the rule is the table itself.
  noExternal: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
} as UserConfig

import type { UserConfig } from 'tsdown'

const external = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-runtime/client', '@deepseek-ai/dsh-client-ui-slots',
] as const

export default {
  name: 'dsh-plugin-manager/client', entry: { client: 'src/client/index.ts' }, outDir: 'lib',
  format: 'cjs', platform: 'browser', dts: false, clean: false, sourcemap: false,
  external: [...external], noExternal: (id: string) => external.includes(id as never) ? undefined : true,
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-plugin-manager", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
} as UserConfig

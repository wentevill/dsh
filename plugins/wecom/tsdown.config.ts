import type { UserConfig } from 'tsdown'

const external = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-runtime/client',
] as const

export default {
  name: 'dsh-wecom/client', entry: { client: 'src/client/index.tsx' }, outDir: 'lib',
  format: 'cjs', platform: 'browser', dts: false, clean: false, sourcemap: false,
  external: [...external], noExternal: (id: string) => external.includes(id as never) ? undefined : true,
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-wecom", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
} as UserConfig

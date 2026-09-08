import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FaceModelEmitter, WorkspaceAnalyzer } from '@deepseek-ai/dsh-typert-generator'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const staging = mkdtempSync(resolve(tmpdir(), 'dsh-cron-typert-'))
const pkg = resolve(staging, 'packages/cron')
const protocol = resolve(staging, 'packages/typert-protocol')
const protocolRoot = resolve(root, 'node_modules/@deepseek-ai/dsh-typert-protocol')
try {
  mkdirSync(pkg, { recursive: true })
  cpSync(resolve(root, '../../tsconfig.base.json'), resolve(staging, 'tsconfig.base.json'))
  cpSync(resolve(root, 'src'), resolve(pkg, 'src'), { recursive: true })
  for (const file of ['package.json', 'tsconfig.json', 'tsconfig.build.json']) {
    cpSync(resolve(root, file), resolve(pkg, file))
  }
  symlinkSync(resolve(root, 'node_modules'), resolve(pkg, 'node_modules'), 'dir')
  mkdirSync(resolve(protocol, 'src'), { recursive: true })
  cpSync(resolve(protocolRoot, 'package.json'), resolve(protocol, 'package.json'))
  cpSync(resolve(protocolRoot, 'lib/types/index.d.ts'), resolve(protocol, 'src/index.ts'))
  cpSync(resolve(protocolRoot, 'lib/types/types.d.ts'), resolve(protocol, 'src/types.ts'))
  writeFileSync(resolve(protocol, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2024', module: 'NodeNext', moduleResolution: 'NodeNext',
      strict: true, noEmit: true, skipLibCheck: true,
    },
    include: ['src'],
  }))
  writeFileSync(resolve(staging, 'tsconfig.host.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2024', module: 'NodeNext', moduleResolution: 'NodeNext', baseUrl: '.',
      paths: {
        '@deepseek-ai/dsh-typert-protocol': ['./packages/typert-protocol/src/index.ts'],
        '@deepseek-ai/dsh-typert-protocol/types': ['./packages/typert-protocol/src/types.ts'],
      },
      skipLibCheck: true,
    },
    files: [],
    references: [
      { path: './packages/cron/tsconfig.build.json' },
      { path: './packages/typert-protocol/tsconfig.json' },
    ],
  }))
  const analyzer = new WorkspaceAnalyzer({
    root: staging, faces: ['host'], packages: ['dsh-cron'], checkDiagnostics: true,
  })
  analyzer.discoverPackages()
  const face = analyzer.analyze().faces.find(candidate => candidate.face === 'host')
  const model = face?.packages.find(candidate => candidate.name === 'dsh-cron')
  if (face === undefined || model === undefined) throw new Error('Typert could not model dsh-cron')
  const emitted = new FaceModelEmitter(face).emit(model.name)
  if (emitted.remote === undefined) throw new Error('Typert found no Cron Remote methods')
  mkdirSync(resolve(root, 'lib'), { recursive: true })
  writeFileSync(resolve(root, 'lib/typert.host.js'), emitted.js)
  writeFileSync(resolve(root, 'lib/typert.host.d.ts'), emitted.dts)
  writeFileSync(resolve(root, 'lib/typert.remote-client.js'), emitted.remote.js)
  writeFileSync(resolve(root, 'lib/typert.remote-client.d.ts'), emitted.remote.dts)
} finally {
  rmSync(staging, { recursive: true, force: true })
}

import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FaceModelEmitter, WorkspaceAnalyzer } from '@deepseek-ai/dsh-typert-generator'

const mailRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const stagingRoot = mkdtempSync(resolve(tmpdir(), 'dsh-mail-typert-'))
const stagedPackage = resolve(stagingRoot, 'packages/mail')
const stagedProtocol = resolve(stagingRoot, 'packages/typert-protocol')
const protocolRoot = resolve(mailRoot, 'node_modules/@deepseek-ai/dsh-typert-protocol')

try {
  mkdirSync(stagedPackage, { recursive: true })
  cpSync(resolve(mailRoot, 'src'), resolve(stagedPackage, 'src'), { recursive: true })
  for (const file of ['package.json', 'tsconfig.json', 'tsconfig.build.json']) {
    cpSync(resolve(mailRoot, file), resolve(stagedPackage, file))
  }
  symlinkSync(resolve(mailRoot, 'node_modules'), resolve(stagedPackage, 'node_modules'), 'dir')
  mkdirSync(resolve(stagedProtocol, 'src'), { recursive: true })
  cpSync(resolve(protocolRoot, 'package.json'), resolve(stagedProtocol, 'package.json'))
  cpSync(resolve(protocolRoot, 'lib/types/index.d.ts'), resolve(stagedProtocol, 'src/index.ts'))
  cpSync(resolve(protocolRoot, 'lib/types/types.d.ts'), resolve(stagedProtocol, 'src/types.ts'))
  writeFileSync(resolve(stagedProtocol, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2024', module: 'NodeNext', moduleResolution: 'NodeNext',
      strict: true, noEmit: true, skipLibCheck: true,
    },
    include: ['src'],
  }))
  writeFileSync(resolve(stagingRoot, 'tsconfig.host.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2024', module: 'NodeNext', moduleResolution: 'NodeNext',
      baseUrl: '.',
      paths: {
        '@deepseek-ai/dsh-typert-protocol': ['./packages/typert-protocol/src/index.ts'],
        '@deepseek-ai/dsh-typert-protocol/types': ['./packages/typert-protocol/src/types.ts'],
      },
      skipLibCheck: true,
    },
    files: [],
    references: [
      { path: './packages/mail/tsconfig.build.json' },
      { path: './packages/typert-protocol/tsconfig.json' },
    ],
  }))

  const analyzer = new WorkspaceAnalyzer({
    root: stagingRoot,
    faces: ['host'],
    packages: ['dsh-mail-plugin'],
    checkDiagnostics: true,
  })
  const discovered = analyzer.discoverPackages()
  const workspace = analyzer.analyze()
  const face = workspace.faces.find(candidate => candidate.face === 'host')
  if (face === undefined) throw new Error('mail Typert generation found no Host face')
  const packageModel = face.packages.find(candidate => candidate.name === 'dsh-mail-plugin')
  if (packageModel === undefined) {
    throw new Error(`mail Typert generation did not model dsh-mail-plugin; discovered: ${JSON.stringify(discovered)}; modeled: ${face.packages.map(candidate => candidate.name).join(', ')}`)
  }
  const emitted = new FaceModelEmitter(face).emit(packageModel.name)
  if (emitted.remote === undefined) throw new Error('mail Typert generation found no Remote methods')

  mkdirSync(resolve(mailRoot, 'lib'), { recursive: true })
  writeFileSync(resolve(mailRoot, 'lib/typert.host.js'), emitted.js)
  writeFileSync(resolve(mailRoot, 'lib/typert.host.d.ts'), emitted.dts)
  writeFileSync(resolve(mailRoot, 'lib/typert.remote-client.js'), emitted.remote.js)
  writeFileSync(resolve(mailRoot, 'lib/typert.remote-client.d.ts'), emitted.remote.dts)
} finally {
  rmSync(stagingRoot, { recursive: true, force: true })
}

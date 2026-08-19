import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { auditPackageArchive, auditPackageEntries } from '../scripts/release-audit.mjs'
import { readPackageVersion } from '../scripts/pack-release.mjs'

const root = resolve(import.meta.dirname, '..')
const packagingRoot = resolve(root, '../..')
const runtimeDependencies = [
  '@deepseek-ai/schemastery',
  'html-to-text',
  'imapflow',
  'mailparser',
  'mime-types',
  'nodemailer',
  'zod',
]

function pack(): string {
  const destination = mkdtempSync(resolve(tmpdir(), 'dsh-mail-pack-'))
  execFileSync('corepack', ['pnpm', '--dir', root, 'pack', '--pack-destination', destination])
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }
  return resolve(destination, `dsh-mail-${manifest.version}.tgz`)
}

describe('published mail plugin', () => {
  it('imports the public attachment loader from an installed-style package subpath', () => {
    const consumer = mkdtempSync(resolve(tmpdir(), 'dsh-mail-consumer-'))
    const modules = resolve(consumer, 'node_modules')
    mkdirSync(modules)
    symlinkSync(root, resolve(modules, 'dsh-mail'))

    const result = execFileSync(process.execPath, [
      '--input-type=module',
      '--eval',
      'import("dsh-mail/attachment-loader").then(module => process.stdout.write(Object.keys(module).sort().join(",")))',
    ], { cwd: consumer, encoding: 'utf8' })

    expect(result).toBe('DEFAULT_ATTACHMENT_LIMITS,loadAttachments')
  })

  it('exports SMTP sending and body normalization through package subpaths and the root artifact', () => {
    const consumer = mkdtempSync(resolve(tmpdir(), 'dsh-mail-consumer-'))
    const modules = resolve(consumer, 'node_modules')
    mkdirSync(modules)
    symlinkSync(root, resolve(modules, 'dsh-mail'))

    const result = execFileSync(process.execPath, [
      '--input-type=module',
      '--eval',
      'Promise.all([import("dsh-mail/html"), import("dsh-mail/smtp-transport")]).then(([html, smtp]) => process.stdout.write([typeof html.normalizeBodies, typeof smtp.MailSmtpTransport].join(",")))',
    ], { cwd: consumer, encoding: 'utf8' })

    expect(result).toBe('function,function')
    const rootArtifact = readFileSync(resolve(root, 'lib/index.js'), 'utf8')
    expect(rootArtifact).toContain('export { normalizeBodies } from "./html.js";')
    expect(rootArtifact).toContain('export { MailSmtpTransport } from "./smtp-transport.js";')
  })

  it('declares plugin libraries as dependencies and DSH capabilities as peers', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      name: string
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      files?: string[]
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.name).toBe('dsh-mail')
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(runtimeDependencies)
    expect(Object.keys(manifest.peerDependencies ?? {}).sort()).toEqual([
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-credentials',
      '@deepseek-ai/dsh-mail',
      '@deepseek-ai/dsh-settings',
      '@deepseek-ai/dsh-system-prompt',
      '@deepseek-ai/dsh-tools',
      '@deepseek-ai/dsh-typert-protocol',
    ])
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.files).toEqual(expect.arrayContaining([
      'lib/index.js',
      'lib/client.js',
      'lib/typert.host.js',
      'lib/typert.remote-client.js',
      'cordis.patch.yml',
      'LICENSE',
    ]))
    expect(manifest.files).not.toContain('src')
  })

  it('validates release identity and semantic version before naming the archive', () => {
    const fixture = mkdtempSync(resolve(tmpdir(), 'dsh-mail-version-'))
    const manifest = resolve(fixture, 'package.json')
    writeFileSync(manifest, JSON.stringify({ name: 'dsh-mail', version: 'not-a-version' }))
    expect(() => readPackageVersion(manifest)).toThrow(/invalid package version/u)
    writeFileSync(manifest, JSON.stringify({ name: 'legacy-mail', version: '1.2.3' }))
    expect(() => readPackageVersion(manifest)).toThrow(/expected package name dsh-mail/u)
  })

  it('uses the endpoint secure boolean expected by the mail seam', () => {
    const patch = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain('secure: true')
    expect(patch).not.toContain('tls: implicit')
  })

  it('ships every declared runtime artifact in the production archive', () => {
    const archive = pack()
    const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n')
    expect(files).toEqual(expect.arrayContaining([
      'package/package.json',
      'package/lib/index.js',
      'package/lib/index.d.ts',
      'package/lib/approval.js',
      'package/lib/approval.d.ts',
      'package/lib/tools.js',
      'package/lib/tools.d.ts',
      'package/lib/mail-settings.js',
      'package/lib/mail-settings.d.ts',
      'package/lib/mail-types.js',
      'package/lib/mail-types.d.ts',
      'package/lib/remote-settings.js',
      'package/lib/remote-settings.d.ts',
      'package/lib/remote-types.js',
      'package/lib/remote-types.d.ts',
      'package/lib/transport.js',
      'package/lib/transport.d.ts',
      'package/lib/imap-transport.js',
      'package/lib/imap-transport.d.ts',
      'package/lib/client.js',
      'package/lib/attachment-loader.js',
      'package/lib/attachment-loader.d.ts',
      'package/lib/html.js',
      'package/lib/html.d.ts',
      'package/lib/smtp-transport.js',
      'package/lib/smtp-transport.d.ts',
      'package/lib/typert.host.js',
      'package/lib/typert.host.d.ts',
      'package/lib/typert.remote-client.js',
      'package/lib/typert.remote-client.d.ts',
      'package/cordis.patch.yml',
      'package/LICENSE',
    ]))
    for (const dependency of runtimeDependencies) {
      expect(files.some(file => file.startsWith(`package/node_modules/${dependency}/`)), dependency).toBe(true)
    }
    expect(files.some(file => file.startsWith('package/src/'))).toBe(false)
    expect(auditPackageArchive(archive).productionPackages).toContain('nodemailer')
  })

  it('rejects incomplete, dev-only, linked, and workspace-derived archive trees', () => {
    const manifest = (value: unknown) => Buffer.from(JSON.stringify(value))
    const rootManifest = {
      name: 'fixture', version: '1.0.0', dependencies: { runtime: '1.0.0' },
      devDependencies: { developer: '1.0.0' },
    }
    const entries = (runtime: unknown = { name: 'runtime', version: '1.0.0' }) => [
      { path: 'package/package.json', type: 'file' as const, content: manifest(rootManifest) },
      { path: 'package/node_modules/runtime/package.json', type: 'file' as const, content: manifest(runtime) },
    ]

    expect(() => auditPackageEntries(entries().slice(0, 1))).toThrow(/missing production dependency/u)
    expect(() => auditPackageEntries([
      ...entries(),
      { path: 'package/node_modules/developer/package.json', type: 'file' as const, content: manifest({ name: 'developer', version: '1.0.0' }) },
    ])).toThrow(/dev-only|unreachable/u)
    expect(() => auditPackageEntries([
      ...entries(),
      { path: 'package/node_modules/runtime/node_modules/developer/package.json', type: 'file' as const, content: manifest({ name: 'developer', version: '1.0.0' }) },
    ])).toThrow(/dev-only|unreachable/u)
    expect(() => auditPackageEntries([
      ...entries(),
      { path: 'package/node_modules/runtime/link', type: 'symlink' as const, linkPath: '/tmp/escape' },
    ])).toThrow(/link/u)
    expect(() => auditPackageEntries(entries({ name: 'runtime', version: '1.0.0', dependencies: { leaked: 'workspace:*' } }))).toThrow(/workspace/u)
  })

  it('binds Make packaging and installation to the Desktop runtime', () => {
    const makefile = readFileSync(resolve(packagingRoot, 'Makefile'), 'utf8')
    expect(makefile).not.toMatch(/MAIL_[A-Z_]+\s*[:?+]?=\s*\$\(shell\b/u)
    expect(makefile).not.toContain('corepack pnpm mail:pack')
    expect(makefile).toContain('scripts/pack-release.mjs')
    expect(makefile).toContain('"$(NODE)"')
    expect(makefile).toContain('scripts/install-release.mjs')
    expect(makefile).toContain('--cli "$(DSH_CLI)"')
  })

  it('builds the release from a frozen install and an offline production deploy tree', () => {
    const script = readFileSync(resolve(root, 'scripts/pack-release.mjs'), 'utf8')
    expect(script).toContain("'install', '--frozen-lockfile'")
    expect(script).toContain("'deploy', '--prod'")
    expect(script).toContain("npm_config_offline: 'true'")
    expect(script.match(/--config\.node-linker=hoisted/gu)).toHaveLength(3)
    expect(script).not.toContain("['prune'")
    expect(script).not.toContain("['install', '--prod'")
  })
})

import { createHash } from 'node:crypto'
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as runtimeStaging from './stage-runtime.ts'
import { augmentDesktopRuntimeClosure, breakRuntimeHardlinks, buildEnvironment, createStageDirectory, installStagedRuntime, materializeRuntimeLinks, patchClientModuleBatchCompatibility, patchLegacyTypertCompatibility, removeRuntimeLink, signRuntimeExecutable, verifyPackageIntegrity, verifySha256 } from './stage-runtime.ts'

describe('runtime staging', () => {
  it('migrates accumulated port cookies and leaves ten MiB of request-header space', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-browser-session-'))
    const connectionRoot = join(root, 'node_modules/@deepseek-ai/dsh-client-connection')
    const connectionTarget = join(connectionRoot, 'lib/index.js')
    const webserverRoot = join(root, 'node_modules/@deepseek-ai/dsh-host-webserver')
    const webserverTarget = join(webserverRoot, 'lib/index.js')
    mkdirSync(join(connectionRoot, 'lib'), { recursive: true })
    mkdirSync(join(webserverRoot, 'lib'), { recursive: true })
    writeFileSync(join(connectionRoot, 'package.json'), JSON.stringify({ type: 'module' }))
    writeFileSync(join(webserverRoot, 'package.json'), JSON.stringify({ type: 'module' }))
    writeFileSync(connectionTarget, [
      'import { createHash } from "node:crypto";',
      'const COOKIE_PREFIX = "dsh-auth-";',
      'const TOKEN_QUERY = "token";',
      'function encodeBase64Url(value) { return Buffer.from(value).toString("base64url"); }',
      'function header(headers, name) { return headers[name]; }',
      'function requestAuthority(headers) { return headers.host; }',
      'function tokenMatches(actual, expected) { return actual === expected; }',
      'function cookieName(authority) {',
      '  return COOKIE_PREFIX + encodeBase64Url(createHash("sha256").update(authority).digest());',
      '}',
      'function cookieValue(headerValue, name) {',
      '  for (const segment of headerValue.split(";")) {',
      '    const at = segment.indexOf("=");',
      '    if (at !== -1 && segment.slice(0, at).trim() === name) return segment.slice(at + 1).trim();',
      '  }',
      '}',
      'function sessionCookie(name, value) { return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict`; }',
      'class BrowserAuth {',
      '  launchToken = "launch-token";',
      '  maxAgeMilliseconds = 3600000;',
      '  authorizeIndex(req, res) {',
      '    const url = new URL(req.url ?? "/", "http://dsh.invalid");',
      '    const tokens = url.searchParams.getAll(TOKEN_QUERY);',
      '    const authority = requestAuthority(req.headers);',
      '    if (req.method === "GET" && url.pathname === "/" && tokens.length === 1 && authority !== undefined && tokenMatches(tokens.join(""), this.launchToken)) {',
      '      const expiresAt = Date.now() + this.maxAgeMilliseconds;',
      '      const value = "signed-cookie";',
      '      res.writeHead(303, {',
      '        "cache-control": "no-store",',
      '        "location": "/",',
      '        "referrer-policy": "no-referrer",',
      '        "set-cookie": sessionCookie(cookieName(authority), value, expiresAt, Math.floor(this.maxAgeMilliseconds / 1e3))',
      '      });',
      '      res.end();',
      '      return false;',
      '    }',
      '  }',
      '  isAuthenticated(request) {',
      '    const authority = requestAuthority(request.headers);',
      '    const rawCookie = header(request.headers, "cookie");',
      '    return authority !== undefined && rawCookie !== undefined && cookieValue(rawCookie, cookieName(authority)) === "signed-cookie";',
      '  }',
      '}',
      'export { BrowserAuth, cookieName };',
      '',
    ].join('\n'))
    writeFileSync(webserverTarget, [
      'import { createServer } from "node:http";',
      'export function startServer() {',
      '  const server = createServer((req, res) => { res.end("ok"); });',
      '  return server;',
      '}',
      '',
    ].join('\n'))

    const patchBrowserSessionCompatibility = (runtimeStaging as typeof runtimeStaging & {
      patchBrowserSessionCompatibility(appRoot: string): void
    }).patchBrowserSessionCompatibility
    patchBrowserSessionCompatibility(root)

    const connection = await import(`${pathToFileURL(connectionTarget).href}?v=browser-session`) as {
      BrowserAuth: new () => { authorizeIndex(req: object, res: object): boolean }
      cookieName(authority: string): string
    }
    expect(connection.cookieName('127.0.0.1:41001')).toBe(connection.cookieName('127.0.0.1:51002'))
    let responseHeaders: Record<string, string | string[]> = {}
    const response = {
      writeHead: (_status: number, headers: Record<string, string | string[]>) => { responseHeaders = headers },
      end: () => {},
    }
    new connection.BrowserAuth().authorizeIndex({
      method: 'GET',
      url: '/?token=launch-token',
      headers: {
        host: '127.0.0.1:51002',
        cookie: 'dsh-auth-old-port-a=one; unrelated=keep; dsh-auth-old-port-b=two',
      },
    }, response)
    expect(responseHeaders['set-cookie']).toEqual([
      `${connection.cookieName('127.0.0.1:51002')}=signed-cookie; Path=/; HttpOnly; SameSite=Strict`,
      'dsh-auth-old-port-a=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict',
      'dsh-auth-old-port-b=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict',
    ])

    const webserver = await import(`${pathToFileURL(webserverTarget).href}?v=large-header`) as {
      startServer(): import('node:http').Server & { maxHeaderSize: number }
    }
    const server = webserver.startServer()
    expect(server.maxHeaderSize).toBe(10 * 1024 * 1024)
  })

  it('keeps multi-plugin client batches below three MiB for WebKit headroom', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-client-batches-'))
    const packageRoot = join(root, 'node_modules/@deepseek-ai/dsh-client-modules')
    const target = join(packageRoot, 'lib/index.js')
    mkdirSync(join(packageRoot, 'lib'), { recursive: true })
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ type: 'module' }))
    writeFileSync(target, [
      'const MAX_COMBO_URL_BYTES = 3 * 1024;',
      'const COMBO_REVISION_PLACEHOLDER = "0".repeat(12);',
      'function comboUrl(ids, rev, sourceMap = false) {',
      '  return `/plugins/??${ids.map(id => `${id}/client.js${sourceMap ? ".map" : ""}`).join(",")}&rev=${rev}`;',
      '}',
      'function projectedComboUrlBytes(records) { return records.length; }',
      'function partitionComboRecords(records) {',
      '  const chunks = [];',
      '  let current = [];',
      '  for (const record of records) {',
      '    const candidate = [...current, record];',
      '    if (projectedComboUrlBytes(candidate) <= MAX_COMBO_URL_BYTES) { current = candidate; continue; }',
      '    if (current.length === 0) throw new Error("oversize URL");',
      '    chunks.push(current);',
      '    current = [record];',
      '    if (projectedComboUrlBytes(current) > MAX_COMBO_URL_BYTES) throw new Error("oversize URL");',
      '  }',
      '  if (current.length > 0) chunks.push(current);',
      '  return chunks;',
      '}',
      'export { partitionComboRecords };',
      '',
    ].join('\n'))

    patchClientModuleBatchCompatibility(root)

    const module = await import(`${pathToFileURL(target).href}?v=client-batch-limit`) as {
      partitionComboRecords(records: Array<{ entry: { id: string }, bundle: Buffer }>): Array<Array<{ bundle: Buffer }>>
    }
    const batches = module.partitionComboRecords([
      { entry: { id: 'large-a' }, bundle: Buffer.alloc(3 * 1024 * 1024) },
      { entry: { id: 'large-b' }, bundle: Buffer.alloc(2 * 1024 * 1024) },
    ])
    expect(batches.map(batch => batch.length)).toEqual([1, 1])
    const webKitBoundary = module.partitionComboRecords([
      { entry: { id: 'webkit-a' }, bundle: Buffer.alloc(2 * 1024 * 1024) },
      { entry: { id: 'webkit-b' }, bundle: Buffer.alloc(1280 * 1024) },
    ])
    expect(webKitBoundary.map(batch => batch.length)).toEqual([1, 1])
    const trailerBoundary = module.partitionComboRecords([
      { entry: { id: 'boundary-a' }, bundle: Buffer.alloc(2 * 1024 * 1024) },
      { entry: { id: 'boundary-b' }, bundle: Buffer.alloc(2 * 1024 * 1024 - 7) },
    ])
    expect(trailerBoundary.map(batch => batch.length)).toEqual([1, 1])
    const oversizedSingleton = module.partitionComboRecords([
      { entry: { id: 'oversized' }, bundle: Buffer.alloc(4 * 1024 * 1024 + 1) },
      { entry: { id: 'following' }, bundle: Buffer.alloc(1) },
    ])
    expect(oversizedSingleton.map(batch => batch.length)).toEqual([1, 1])
  })

  it('adapts legacy Typert schema objects into lazy codec factories', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-legacy-typert-'))
    const targets = [
      '@deepseek-ai/dsh-typert-loader/lib/index.js',
      '@deepseek-ai/dsh-typert-registry/lib/index.js',
      '@deepseek-ai/dsh-typert-registry/lib/client.js',
    ]
    const fixture = [
      'function schemaValue(schema) {',
      '  if (typeof schema.create !== "function") throw new Error("schema has no create() factory");',
      '  return schema.create().parse("schema-ok");',
      '}',
      'function codecValue(codec) {',
      '  if (typeof codec.create !== "function") throw new Error("codec has no create() factory");',
      '  return codec.create().parse("codec-ok");',
      '}',
      'const parser = { parse: value => value };',
      'export const values = [schemaValue({ schema: parser }), codecValue({ schema: parser })];',
      '',
    ].join('\n')
    for (const target of targets) {
      const path = join(root, 'node_modules', target)
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, fixture)
    }

    patchLegacyTypertCompatibility(root)

    for (const [index, target] of targets.entries()) {
      const module = await import(`${pathToFileURL(join(root, 'node_modules', target)).href}?v=${String(index)}`) as { values: string[] }
      expect(module.values).toEqual(['schema-ok', 'codec-ok'])
    }
  })

  it('ad-hoc signs the bundled executable after copying it', () => {
    const calls: Array<{ command: string, args: string[] }> = []

    signRuntimeExecutable('/runtime/node/bin/node', (command, args) => calls.push({ command, args }))

    expect(calls).toEqual([{
      command: 'codesign',
      args: ['--force', '--sign', '-', '/runtime/node/bin/node'],
    }])
  })

  it('reconciles the packaged dsh closure after replacing the upstream Desktop package', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-runtime-closure-'))
    const cli = join(root, 'apps/cli/package.json')
    const desktop = join(root, 'apps/desktop/package.json')
    const workspace = join(root, 'pnpm-workspace.yaml')
    const tsdown = join(root, 'tsdown.config.ts')
    mkdirSync(join(root, 'apps/cli'), { recursive: true })
    mkdirSync(join(root, 'apps/desktop'), { recursive: true })
    writeFileSync(cli, JSON.stringify({ name: '@deepseek-ai/dsh', dependencies: { existing: 'workspace:^' } }))
    writeFileSync(desktop, JSON.stringify({ dependencies: {
      '@deepseek-ai/dsh': 'workspace:^',
      '@deepseek-ai/dsh-mail': 'workspace:^',
      'dsh-plugin-manager': 'workspace:*',
      pnpm: '11.7.0',
    } }))
    writeFileSync(workspace, [
      'patchedDependencies:',
      "  '@electron/osx-sign@1.3.3': patches/@electron__osx-sign@1.3.3.patch",
      "  '@yao-pkg/pkg@6.21.0': patches/@yao-pkg__pkg@6.21.0.patch",
      '',
    ].join('\n'))
    writeFileSync(tsdown, "workspace: ['vendor/*', 'apps/cli', 'apps/desktop', 'apps/desktop-host'],\n")

    augmentDesktopRuntimeClosure(root)

    const manifest = JSON.parse(readFileSync(cli, 'utf8')) as { dependencies: Record<string, string> }
    expect(manifest.dependencies).toMatchObject({ existing: 'workspace:^', '@deepseek-ai/dsh-mail': 'workspace:^' })
    expect(manifest.dependencies).not.toHaveProperty('pnpm')
    expect(manifest.dependencies).not.toHaveProperty('dsh-plugin-manager')
    expect(readFileSync(workspace, 'utf8')).toBe([
      'patchedDependencies:',
      "  '@yao-pkg/pkg@6.21.0': patches/@yao-pkg__pkg@6.21.0.patch",
      '',
    ].join('\n'))
    expect(readFileSync(tsdown, 'utf8')).toBe(
      "workspace: ['vendor/*', 'apps/cli', 'apps/desktop-host'],\n",
    )
  })

  it('rejects a lockfile whose bundled package integrity is not pinned', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-lock-integrity-'))
    const lock = join(root, 'pnpm-lock.yaml')
    writeFileSync(lock, "packages:\n\n  pnpm@11.7.0:\n    resolution: {integrity: sha512-wrong}\n")
    expect(() => verifyPackageIntegrity(lock, 'pnpm', '11.7.0', 'sha512-expected')).toThrow(/integrity mismatch/)
  })

  it('creates staging outside the Desktop source tree on a fresh checkout', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-stage-parent-'))
    const destination = join(root, 'missing', 'resources', 'runtime')
    const stagingParent = join(root, 'packaging-root')
    const stage = createStageDirectory(destination, stagingParent)
    expect(lstatSync(stage).isDirectory()).toBe(true)
    expect(stage.startsWith(stagingParent)).toBe(true)
    expect(lstatSync(join(root, 'missing', 'resources')).isDirectory()).toBe(true)
  })

  it('atomically replaces a previously staged runtime directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-install-runtime-'))
    const staged = join(root, 'staged')
    const destination = join(root, 'runtime')
    mkdirSync(join(staged, 'app'), { recursive: true })
    mkdirSync(join(destination, 'old'), { recursive: true })
    writeFileSync(join(staged, 'app/new.js'), 'new runtime')
    writeFileSync(join(destination, 'old/stale.js'), 'stale runtime')

    installStagedRuntime(staged, destination)

    expect(readFileSync(join(destination, 'app/new.js'), 'utf8')).toBe('new runtime')
    expect(existsSync(join(destination, 'old/stale.js'))).toBe(false)
    expect(existsSync(staged)).toBe(false)
  })

  it('runs assembly tools with the pinned Node and archived upstream commit', () => {
    const environment = buildEnvironment(
      '/runtime/node/bin/node',
      'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e',
      { PATH: '/host/bin', TOKEN: 'kept' },
    )
    expect(environment.PATH).toBe(`/runtime/node/bin${delimiter}/host/bin`)
    expect(environment.DSH_CLIENT_COMMIT_HASH).toBe('b150a551b8d465e31e418e1b2eaf5e79bbb7d28e')
    expect(environment.TOKEN).toBe('kept')
  })

  it('accepts only the pinned archive checksum', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dsh-stage-')), 'node.tgz')
    writeFileSync(path, 'official bytes')
    const checksum = createHash('sha256').update('official bytes').digest('hex')
    expect(() => verifySha256(path, checksum)).not.toThrow()
    expect(() => verifySha256(path, '0'.repeat(64))).toThrow(/checksum mismatch/)
  })

  it('materializes package links without copying nested dependency trees', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-links-'))
    const target = join(root, 'target')
    const nodeModules = join(root, 'node_modules')
    mkdirSync(join(target, 'node_modules'), { recursive: true })
    mkdirSync(nodeModules)
    writeFileSync(join(target, 'lib.js'), 'built package')
    writeFileSync(join(target, 'node_modules/duplicate.js'), 'duplicate')
    symlinkSync(target, join(nodeModules, 'package'))

    materializeRuntimeLinks(nodeModules)

    expect(lstatSync(join(nodeModules, 'package')).isSymbolicLink()).toBe(false)
    expect(lstatSync(join(nodeModules, 'package/lib.js')).isFile()).toBe(true)
    expect(() => lstatSync(join(nodeModules, 'package/node_modules'))).toThrow()
  })

  it('removes deployed directory links without deleting their targets on Node 24', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-remove-link-'))
    const target = join(root, 'target')
    const link = join(root, 'link')
    mkdirSync(target)
    writeFileSync(join(target, 'kept.js'), 'kept')
    symlinkSync(target, link)

    removeRuntimeLink(link)

    expect(lstatSync(link, { throwIfNoEntry: false })).toBeUndefined()
    expect(readFileSync(join(target, 'kept.js'), 'utf8')).toBe('kept')
  })

  it('materializes the pnpm bin as a location-correct private launcher', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-pnpm-bin-'))
    const nodeModules = join(root, 'node_modules')
    mkdirSync(join(nodeModules, '.bin'), { recursive: true })
    mkdirSync(join(nodeModules, 'pnpm/bin'), { recursive: true })
    writeFileSync(join(nodeModules, 'pnpm/bin/pnpm.cjs'), "import('./pnpm.mjs')\n")
    symlinkSync('../pnpm/bin/pnpm.cjs', join(nodeModules, '.bin/pnpm'))

    materializeRuntimeLinks(nodeModules)

    expect(lstatSync(join(nodeModules, '.bin/pnpm')).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(nodeModules, '.bin/pnpm'), 'utf8')).toBe(
      "#!/usr/bin/env node\nimport '../pnpm/bin/pnpm.cjs'\n",
    )
  })

  it('isolates staged files from hardlinked workspace and store files', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-hardlinks-'))
    const source = join(root, 'source.js')
    const runtime = join(root, 'runtime')
    mkdirSync(runtime)
    writeFileSync(source, 'original')
    linkSync(source, join(runtime, 'client.js'))

    breakRuntimeHardlinks(runtime)
    writeFileSync(source, 'changed outside runtime')

    expect(readFileSync(join(runtime, 'client.js'), 'utf8')).toBe('original')
    expect(statSync(join(runtime, 'client.js')).ino).not.toBe(statSync(source).ino)
  })
})

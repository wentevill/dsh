import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildHermeticEnvironment } from '../../mail/scripts/release-env.mjs'

const pluginRoot = resolve(import.meta.dirname, '..')
const repositoryRoot = resolve(pluginRoot, '../..')
const commonGitDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
  cwd: repositoryRoot, encoding: 'utf8',
}).trim()
const checkoutRoot = dirname(resolve(repositoryRoot, commonGitDir))
const runtime = join(checkoutRoot, 'apps/desktop/src-tauri/resources/runtime')
const node = join(runtime, 'node/bin/node')
const cli = join(runtime, 'app/node_modules/@deepseek-ai/dsh/lib/bin.js')
const packageBin = join(runtime, 'app/node_modules/.bin')
const upstream = join(checkoutRoot, 'deepseek-harness-source')
const pinnedRevision = (JSON.parse(readFileSync(join(repositoryRoot, 'upstream.lock.json'), 'utf8')) as {
  revision: string
}).revision
const requireFromPlugin = createRequire(join(pluginRoot, 'package.json'))

interface WebHandle {
  readonly child: ChildProcessWithoutNullStreams
  readonly base: URL
  readonly headers: { readonly cookie: string }
  readonly html: string
  readonly client: string
  readonly logs: () => string
}

interface CronDefinitionWire {
  readonly id: string
  readonly state: 'active' | 'paused' | 'deleted'
  readonly revision: number
}

interface CronExecutionWire {
  readonly sessionId?: string
}

let rpcSequence = 0

function runDsh(env: NodeJS.ProcessEnv, args: string[]) {
  return spawnSync(node, [cli, ...args], { encoding: 'utf8', env })
}

async function bootWeb(env: NodeJS.ProcessEnv): Promise<WebHandle> {
  return new Promise((resolveBoot, rejectBoot) => {
    const child = spawn(node, [cli, '--profile', 'web', '--host', '127.0.0.1', '--port', '0'], {
      env, stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      const origin = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/u.exec(stdout)?.[1]
      if (settled || origin === undefined) return
      settled = true
      void authenticate(child, origin, () => boundedLogs(stdout, stderr)).then(resolveBoot, error => {
        child.kill('SIGTERM')
        rejectBoot(error)
      })
    })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      rejectBoot(new Error(`Cron Web startup timed out\n${boundedLogs(stdout, stderr)}`))
    }, 60_000)
    child.once('error', error => {
      clearTimeout(timer)
      if (!settled) {
        settled = true
        rejectBoot(error)
      }
    })
    child.once('exit', code => {
      clearTimeout(timer)
      if (!settled) {
        settled = true
        rejectBoot(new Error(`Cron Web exited before startup (${String(code)})\n${boundedLogs(stdout, stderr)}`))
      }
    })
  })
}

async function authenticate(
  child: ChildProcessWithoutNullStreams,
  origin: string,
  logs: () => string,
): Promise<WebHandle> {
  const authenticated = await fetch(origin, { redirect: 'manual' })
  const cookie = authenticated.headers.getSetCookie()[0]?.split(';', 1)[0]
  if (authenticated.status !== 303 || cookie === undefined) {
    throw new Error(`Web token exchange returned HTTP ${authenticated.status}`)
  }
  const base = new URL(authenticated.headers.get('location') ?? '/', origin)
  const headers = { cookie }
  const html = await fetch(base, { headers }).then(async response => {
    if (!response.ok) throw new Error(`Web root returned HTTP ${response.status}`)
    return response.text()
  })
  const graphSource = /globalThis\["__DSH_BOOT__"\] = (.+)<\/script>/u.exec(html)?.[1]
  if (graphSource === undefined) throw new Error('Web root did not carry __DSH_BOOT__')
  const graph = JSON.parse(graphSource) as { batches?: Array<{ url?: unknown; entries?: unknown }> }
  const clientUrl = graph.batches?.find(batch =>
    Array.isArray(batch.entries) && batch.entries.includes('dsh-cron'))?.url
  if (typeof clientUrl !== 'string') throw new Error('Web boot graph did not batch dsh-cron')
  const client = await fetch(new URL(clientUrl, base), { headers }).then(async response => {
    if (!response.ok) throw new Error(`Cron Client returned HTTP ${response.status}`)
    return response.text()
  })
  return { child, base, headers, html, client, logs }
}

async function rpc<T>(
  web: WebHandle,
  method: string,
  parameter: 'request' | '_request',
  request: unknown,
): Promise<T> {
  const rpcId = `cron-composition-e2e-${rpcSequence += 1}`
  const response = await fetch(new URL(`/api/${method}`, web.base), {
    method: 'POST',
    headers: { ...web.headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request', rpcId, method,
      payload: { args: { [parameter]: request } },
    }),
  })
  if (!response.ok) throw new Error(`${method} returned HTTP ${response.status}`)
  const envelope = await response.json() as {
    rpcId?: string
    result?: { ok?: boolean; value?: T; error?: unknown }
  }
  if (envelope.rpcId !== rpcId || envelope.result?.ok !== true) {
    throw new Error(`${method} failed: ${boundedJson(envelope)}`)
  }
  return envelope.result.value as T
}

async function waitFor<T>(read: () => Promise<T | undefined>, timeoutMs: number): Promise<T> {
  const deadline = Date.now() + timeoutMs
  do {
    const value = await read()
    if (value !== undefined) return value
    await new Promise(resolveWait => setTimeout(resolveWait, 250))
  } while (Date.now() < deadline)
  throw new Error(`condition was not observed within ${timeoutMs}ms`)
}

async function closeWeb(web: WebHandle | undefined): Promise<void> {
  if (web === undefined || web.child.exitCode !== null) return
  const exited = new Promise<void>(resolveExit => web.child.once('exit', () => resolveExit()))
  web.child.kill('SIGTERM')
  const forced = setTimeout(() => web.child.kill('SIGKILL'), 5_000)
  await exited
  clearTimeout(forced)
}

function boundedJson(value: unknown): string {
  return JSON.stringify(value).slice(0, 2_000)
}

function boundedLogs(stdout: string, stderr: string): string {
  return `stdout:\n${stdout.slice(-2_000)}\nstderr:\n${stderr.slice(-2_000)}`
    .replace(/token=[^\s]+/gu, 'token=<redacted>')
}

function loadClientBundle(source: string): Record<string, unknown> {
  const factories = new Map<string, (require: NodeJS.Require) => unknown>()
  const modules = new Map<string, unknown>()
  const loader = {
    load(entry: { id: string; factory: (require: NodeJS.Require) => unknown }) {
      factories.set(entry.id, entry.factory)
    },
  }
  ;(globalThis as unknown as { window: unknown }).window = { __ModuleLoader__: loader }
  try {
    Function(source)()
  } finally {
    delete (globalThis as unknown as { window?: unknown }).window
  }
  const requireBatch = ((id: string) => {
    if (modules.has(id)) return modules.get(id)
    const factory = factories.get(id)
    const value = factory === undefined ? requireFromPlugin(id) : factory(requireBatch)
    modules.set(id, value)
    return value
  }) as NodeJS.Require
  const exported = requireBatch('dsh-cron')
  if (typeof exported !== 'object' || exported === null) {
    throw new Error('Cron Client bundle did not export a plugin')
  }
  return exported as Record<string, unknown>
}

describe('packaged Cron composition canary', () => {
  it('installs the archive and runs fixed and fresh Session tasks through real DSH', {
    timeout: 180_000,
  }, async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'dsh-cron-composition-'))
    const packs = join(sandbox, 'packs')
    const home = join(sandbox, 'dsh')
    const workspacePath = join(sandbox, 'workspace')
    mkdirSync(packs)
    mkdirSync(workspacePath)
    let web: WebHandle | undefined
    const upstreamBefore = {
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: upstream, encoding: 'utf8' }).trim(),
      status: execFileSync('git', ['status', '--short'], { cwd: upstream, encoding: 'utf8' }),
    }
    try {
      execFileSync('corepack', ['pnpm', 'pack', '--pack-destination', packs], {
        cwd: pluginRoot, stdio: 'pipe',
      })
      const archive = join(packs, 'dsh-cron-0.1.0.tgz')
      const env = buildHermeticEnvironment({
        root: join(sandbox, 'environment'), dshHome: home,
        nodeBin: dirname(node), packageBin, offline: true,
      })
      const install = runDsh(env, [
        'plugin', '--profile', 'web', 'add', '--ignore-scripts', archive,
      ])
      expect(install.status, `${install.stdout}\n${install.stderr}`).toBe(0)
      const profile = JSON.parse(readFileSync(join(home, 'profiles/web/package.json'), 'utf8')) as {
        dependencies?: Record<string, string>
      }
      expect(profile.dependencies?.['dsh-cron']).toBeTruthy()
      expect(profile.dependencies?.['dsh-cron']).not.toContain('link:')
      expect(profile.dependencies?.['dsh-cron']).not.toContain(pluginRoot)

      web = await bootWeb(env)
      expect(web.html).toContain('"id":"dsh-cron"')
      expect(web.client).toContain('dsh-cron')
      expect(loadClientBundle(web.client)).toMatchObject({
        name: 'cron-client', inject: ['remote'], apply: expect.any(Function),
      })
      expect(web.logs()).not.toMatch(/failed to apply loader entry|did not activate/u)

      const workspace = await rpc<{
        workspace: { workspaceId: string }
      }>(web, 'workspace/create', 'request', { path: workspacePath })
      const session = await rpc<{ sessionId: string; agentPreset?: string }>(
        web, 'session/create', 'request', { workspaceId: workspace.workspace.workspaceId },
      )
      expect(session.agentPreset).toBeTruthy()

      const baseRequest = {
        sessionId: session.sessionId,
        expression: '* * * * *',
        timezone: 'UTC',
        prompt: 'Reply with exactly: cron composition canary.',
      }
      const fixed = await rpc<CronDefinitionWire>(web, 'cron/create', 'request', {
        ...baseRequest, name: 'fixed session canary', executionMode: 'existing_session',
      })
      const fresh = await rpc<CronDefinitionWire>(web, 'cron/create', 'request', {
        ...baseRequest, name: 'fresh session canary', executionMode: 'new_session',
      })
      const listed = await rpc<readonly CronDefinitionWire[]>(web, 'cron/list', 'request', {
        sessionId: session.sessionId, scope: 'all',
      })
      expect(listed.map(item => item.id).sort()).toEqual([fixed.id, fresh.id].sort())

      const executions = await waitFor(async () => {
        const fixedHistory = await rpc<{ items: readonly CronExecutionWire[] }>(
          web!, 'cron/history', 'request', { sessionId: session.sessionId, cronId: fixed.id, limit: 10 },
        )
        const freshHistory = await rpc<{ items: readonly CronExecutionWire[] }>(
          web!, 'cron/history', 'request', { sessionId: session.sessionId, cronId: fresh.id, limit: 10 },
        )
        const fixedExecution = fixedHistory.items[0]
        const freshExecution = freshHistory.items[0]
        return fixedExecution?.sessionId !== undefined && freshExecution?.sessionId !== undefined
          ? { fixedExecution, freshExecution }
          : undefined
      }, 90_000)
      expect(executions.fixedExecution.sessionId).toBe(session.sessionId)
      expect(executions.freshExecution.sessionId).not.toBe(session.sessionId)

      const freshSession = await waitFor(async () => {
        const sessions = await rpc<{
          items: ReadonlyArray<{
            sessionId: string
            projections?: { asOfSeq?: number }
          }>
        }>(web!, 'session/list', '_request', {})
        const item = sessions.items.find(candidate =>
          candidate.sessionId === executions.freshExecution.sessionId)
        return item?.projections?.asOfSeq === undefined ? undefined : item
      }, 10_000)
      const page = await rpc<{
        records: ReadonlyArray<{
          type: string
          event?: { type: string; data: unknown }
        }>
      }>(web, 'session/page', 'request', {
        address: { kind: 'session', sessionId: executions.freshExecution.sessionId },
        throughSeq: freshSession.projections!.asOfSeq,
        maxMessages: 100,
      })
      const events = page.records.flatMap(record => record.type === 'event' && record.event !== undefined
        ? [record.event]
        : [])
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'permission/preset', data: { preset: 'workspace-write' } }),
        expect.objectContaining({ type: 'sandbox/mode', data: { mode: 'workspace-write' } }),
        expect.objectContaining({ type: 'approval/policy', data: { policy: 'ask' } }),
      ]))

      const paused = await rpc<CronDefinitionWire>(web, 'cron/pause', 'request', {
        sessionId: session.sessionId, cronId: fixed.id,
      })
      expect(paused.state).toBe('paused')
      const resumed = await rpc<CronDefinitionWire>(web, 'cron/resume', 'request', {
        sessionId: session.sessionId, cronId: fixed.id,
      })
      expect(resumed.state).toBe('active')
      const deleted = await rpc<CronDefinitionWire>(web, 'cron/delete', 'request', {
        sessionId: session.sessionId, cronId: fresh.id,
      })
      expect(deleted.state).toBe('deleted')
      const deletedList = await rpc<readonly CronDefinitionWire[]>(web, 'cron/list', 'request', {
        sessionId: session.sessionId, scope: 'deleted',
      })
      expect(deletedList.map(item => item.id)).toContain(fresh.id)
      const reopenedHistory = await rpc<{ items: readonly CronExecutionWire[] }>(
        web, 'cron/history', 'request', { sessionId: session.sessionId, cronId: fresh.id, limit: 10 },
      )
      expect(reopenedHistory.items).not.toHaveLength(0)
    } catch (error) {
      if (web !== undefined) {
        throw new Error(`${error instanceof Error ? error.message : String(error)}\n${web.logs()}`)
      }
      throw error
    } finally {
      await closeWeb(web)
      const upstreamAfter = {
        revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: upstream, encoding: 'utf8' }).trim(),
        status: execFileSync('git', ['status', '--short'], { cwd: upstream, encoding: 'utf8' }),
      }
      expect(upstreamBefore).toEqual({ revision: pinnedRevision, status: '' })
      expect(upstreamAfter).toEqual(upstreamBefore)
      rmSync(sandbox, { recursive: true, force: true })
    }
  })
})

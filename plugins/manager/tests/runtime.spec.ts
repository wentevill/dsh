import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolvePrivateRuntime } from '../src/runtime.ts'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('resolvePrivateRuntime', () => {
  it('derives only verified paths from the running packaged dsh entry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-manager-runtime-'))
    roots.push(root)
    const node = join(root, 'runtime/node/bin/node')
    const dsh = join(root, 'runtime/app/node_modules/@deepseek-ai/dsh/lib/bin.js')
    const pnpm = join(root, 'runtime/app/node_modules/.bin/pnpm')
    await mkdir(join(root, 'runtime/node/bin'), { recursive: true })
    await mkdir(join(root, 'runtime/app/node_modules/@deepseek-ai/dsh/lib'), { recursive: true })
    await mkdir(join(root, 'runtime/app/node_modules/.bin'), { recursive: true })
    await Promise.all([node, dsh, pnpm].map(path => writeFile(path, '')))

    await expect(resolvePrivateRuntime({ execPath: node, argv1: dsh, dshHome: join(root, 'home') }))
      .resolves.toEqual({ node, dsh, packageBin: join(root, 'runtime/app/node_modules/.bin'), dshHome: join(root, 'home') })
  })

  it('rejects a dsh entry outside a node_modules runtime layout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'plugin-manager-runtime-'))
    roots.push(root)
    const node = join(root, 'node')
    const dsh = join(root, 'dsh.js')
    await Promise.all([node, dsh].map(path => writeFile(path, '')))
    await expect(resolvePrivateRuntime({ execPath: node, argv1: dsh, dshHome: join(root, 'home') }))
      .rejects.toMatchObject({ code: 'RUNTIME_UNAVAILABLE' })
  })
})

import { mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { downloadIntoWorkspace, snapshotWorkspaceFile } from '../src/workspace.ts'

describe('Nextcloud workspace transfers', () => {
  it('snapshots only regular files canonically contained in the session workspace', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'nextcloud-workspace-'))
    await writeFile(join(workspace, 'report.txt'), 'quarterly')
    const snapshot = await snapshotWorkspaceFile(workspace, 'report.txt')
    expect(snapshot).toMatchObject({ size: 9 })
    expect(snapshot.sha256).toMatch(/^[a-f0-9]{64}$/u)

    const outside = await mkdtemp(join(tmpdir(), 'nextcloud-outside-'))
    await writeFile(join(outside, 'secret.txt'), 'secret')
    await symlink(join(outside, 'secret.txt'), join(workspace, 'escape.txt'))
    await expect(snapshotWorkspaceFile(workspace, 'escape.txt')).rejects.toThrow(/outside session workspace/u)
  })

  it('downloads into a private directory with collision-safe names and no overwrite', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'nextcloud-download-'))
    const first = await downloadIntoWorkspace(workspace, '/Remote/report.txt', Readable.from('one'))
    const second = await downloadIntoWorkspace(workspace, '/Remote/report.txt', Readable.from('two'))
    expect(first).toBe('.nextcloud-downloads/report.txt')
    expect(second).toBe('.nextcloud-downloads/report (1).txt')
    expect(await readFile(join(workspace, first), 'utf8')).toBe('one')
    expect(await readFile(join(workspace, second), 'utf8')).toBe('two')
  })

  it('rejects an explicit download destination outside the workspace or already present', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'nextcloud-download-'))
    await mkdir(join(workspace, 'downloads'))
    await writeFile(join(workspace, 'downloads/existing.txt'), 'keep')
    await expect(downloadIntoWorkspace(workspace, '/a.txt', Readable.from('new'), '../escape.txt')).rejects.toThrow(/outside session workspace/u)
    await expect(downloadIntoWorkspace(workspace, '/a.txt', Readable.from('new'), 'downloads/existing.txt')).rejects.toThrow(/already exists/u)
    expect(await readFile(join(workspace, 'downloads/existing.txt'), 'utf8')).toBe('keep')
  })

  it('removes an incomplete file when a download stream fails', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'nextcloud-download-'))
    const broken = Readable.from((async function* () { yield 'partial'; throw new Error('network failed') })())
    await expect(downloadIntoWorkspace(workspace, '/broken.txt', broken)).rejects.toThrow('network failed')
    expect(await readdir(join(workspace, '.nextcloud-downloads'))).toEqual([])
  })
})

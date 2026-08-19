import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { waitForFile } from '../src/qr-file.ts'

describe('waitForFile', () => {
  it('waits for a non-empty QR file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wecom-qr-'))
    const path = join(dir, 'qr.png')
    setTimeout(() => { void writeFile(path, new Uint8Array([1, 2, 3])) }, 10)
    await expect(waitForFile(path, new AbortController().signal, 5).then(Array.from)).resolves.toEqual([1, 2, 3])
  })

  it('stops when authorization is cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(waitForFile('/missing/qr.png', controller.signal, 1)).rejects.toMatchObject({ name: 'AbortError' })
  })
})

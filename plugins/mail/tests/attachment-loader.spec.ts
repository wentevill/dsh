import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_ATTACHMENT_LIMITS,
  loadAttachments,
} from '../src/attachment-loader.ts'

let fixtureRoot: string
let workspace: string

beforeEach(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), 'dsh-mail-attachments-'))
  workspace = join(fixtureRoot, 'workspace')
  await mkdir(workspace)
})

afterEach(async () => {
  await rm(fixtureRoot, { force: true, recursive: true })
})

describe('loadAttachments', () => {
  it('loads a relative regular file from the workspace', async () => {
    await writeFile(join(workspace, 'report.txt'), 'hello attachment')

    await expect(loadAttachments([{ path: 'report.txt' }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .resolves.toEqual([{
        filename: 'report.txt',
        contentType: 'text/plain',
        content: Buffer.from('hello attachment'),
        size: 16,
      }])
  })

  it('loads an absolute regular file from the workspace', async () => {
    const attachment = join(workspace, 'report.txt')
    await writeFile(attachment, 'absolute attachment')

    await expect(loadAttachments([{ path: attachment }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .resolves.toMatchObject([{ filename: 'report.txt', content: Buffer.from('absolute attachment'), size: 19 }])
  })

  it('uses the binary fallback when a filename has no known MIME type', async () => {
    await writeFile(join(workspace, 'report.unknown-extension'), 'binary')

    await expect(loadAttachments([{ path: 'report.unknown-extension' }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .resolves.toMatchObject([{ contentType: 'application/octet-stream' }])
  })

  it('rejects a parent traversal request before loading', async () => {
    await writeFile(join(fixtureRoot, 'outside.txt'), 'outside')

    await expect(loadAttachments([{ path: '../outside.txt' }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_OUTSIDE_WORKSPACE' })
  })

  it('rejects a symlink that escapes the workspace', async () => {
    const outside = join(fixtureRoot, 'outside.txt')
    await writeFile(outside, 'outside')
    await symlink(outside, join(workspace, 'outside-link.txt'))

    await expect(loadAttachments([{ path: 'outside-link.txt' }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_OUTSIDE_WORKSPACE' })
  })

  it('rejects an unavailable workspace', async () => {
    await expect(loadAttachments([{ path: 'report.txt' }], join(fixtureRoot, 'missing'), DEFAULT_ATTACHMENT_LIMITS))
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_WORKSPACE_UNAVAILABLE' })
  })

  it('rejects a directory attachment', async () => {
    await mkdir(join(workspace, 'documents'))

    await expect(loadAttachments([{ path: 'documents' }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_NOT_REGULAR' })
  })

  it.skipIf(process.platform === 'win32')('rejects a FIFO attachment', async () => {
    const fifo = join(workspace, 'stream')
    execFileSync('mkfifo', [fifo])

    await expect(loadAttachments([{ path: 'stream' }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_NOT_REGULAR' })
  })

  it('rejects a CR or LF attachment filename', async () => {
    await writeFile(join(workspace, 'bad\nname.txt'), 'bad')

    await expect(loadAttachments([{ path: 'bad\nname.txt' }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_INVALID_FILENAME' })
  })

  it('rejects more than ten attachments', async () => {
    const requests = await Promise.all(Array.from({ length: 11 }, async (_, index) => {
      const filename = `file-${index}.txt`
      await writeFile(join(workspace, filename), 'x')
      return { path: filename }
    }))

    await expect(loadAttachments(requests, workspace, DEFAULT_ATTACHMENT_LIMITS))
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_LIMIT_EXCEEDED' })
  })

  it('accepts exactly ten attachments', async () => {
    const requests = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
      const filename = `file-${index}.txt`
      await writeFile(join(workspace, filename), 'x')
      return { path: filename }
    }))

    await expect(loadAttachments(requests, workspace, DEFAULT_ATTACHMENT_LIMITS))
      .resolves.toHaveLength(10)
  })

  it('rejects a file larger than ten MiB', async () => {
    const filename = join(workspace, 'large.bin')
    await writeFile(filename, '')
    await truncate(filename, DEFAULT_ATTACHMENT_LIMITS.maxFileBytes + 1)

    await expect(loadAttachments([{ path: 'large.bin' }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_LIMIT_EXCEEDED' })
  })

  it('accepts a file exactly ten MiB', async () => {
    const filename = join(workspace, 'maximum.bin')
    await writeFile(filename, '')
    await truncate(filename, DEFAULT_ATTACHMENT_LIMITS.maxFileBytes)

    await expect(loadAttachments([{ path: 'maximum.bin' }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .resolves.toMatchObject([{ filename: 'maximum.bin', size: 10 * 1024 * 1024 }])
  })

  it('rejects a total attachment size larger than twenty-five MiB', async () => {
    const requests = await Promise.all(['one.bin', 'two.bin', 'three.bin'].map(async filename => {
      const target = join(workspace, filename)
      await writeFile(target, '')
      await truncate(target, 9 * 1024 * 1024)
      return { path: filename }
    }))

    await expect(loadAttachments(requests, workspace, DEFAULT_ATTACHMENT_LIMITS))
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_LIMIT_EXCEEDED' })
  })

  it('accepts exactly twenty-five MiB in total', async () => {
    const sizes = [10, 10, 5] as const
    const requests = await Promise.all(sizes.map(async (size, index) => {
      const filename = `maximum-total-${index}.bin`
      const target = join(workspace, filename)
      await writeFile(target, '')
      await truncate(target, size * 1024 * 1024)
      return { path: filename }
    }))

    await expect(loadAttachments(requests, workspace, DEFAULT_ATTACHMENT_LIMITS))
      .resolves.toMatchObject([{ size: 10 * 1024 * 1024 }, { size: 10 * 1024 * 1024 }, { size: 5 * 1024 * 1024 }])
  })

  it('honors an already-aborted signal', async () => {
    await writeFile(join(workspace, 'report.txt'), 'hello')
    const controller = new AbortController()
    controller.abort()

    await expect(loadAttachments([{ path: 'report.txt' }], workspace, DEFAULT_ATTACHMENT_LIMITS, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' })
  })
})

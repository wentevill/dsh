import { execFileSync } from 'node:child_process'
import { appendFile, mkdir, mkdtemp, rename, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_ATTACHMENT_LIMITS,
  loadAttachments,
} from '../src/attachment-loader.ts'
import { createAttachmentLoaderForTesting } from '../src/attachment-loader.internal.ts'

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
  it('snapshots request getters before validating attachment metadata', async () => {
    await writeFile(join(workspace, 'report.txt'), 'snapshot')
    let pathReads = 0
    let filenameReads = 0
    let contentTypeReads = 0
    const request = {
      get path() {
        pathReads += 1
        return pathReads === 1 ? 'report.txt' : '../outside.txt'
      },
      get filename() {
        filenameReads += 1
        return filenameReads === 1 ? 'safe.txt' : 'bad\r\nname.txt'
      },
      get contentType() {
        contentTypeReads += 1
        return contentTypeReads === 1 ? 'text/plain' : 'text/plain\r\nBcc: attacker@example.test'
      },
    }

    await expect(loadAttachments([request], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .resolves.toMatchObject([{ filename: 'safe.txt', contentType: 'text/plain', content: Buffer.from('snapshot') }])
    expect({ pathReads, filenameReads, contentTypeReads }).toEqual({ pathReads: 1, filenameReads: 1, contentTypeReads: 1 })
  })
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

  it('allows a harmless contained parent segment after canonical containment', async () => {
    await mkdir(join(workspace, 'reports'))
    await writeFile(join(workspace, 'report.txt'), 'contained')

    await expect(loadAttachments([{ path: 'reports/../report.txt' }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .resolves.toMatchObject([{ filename: 'report.txt', content: Buffer.from('contained') }])
  })

  it('uses a valid filename and content-type override without retaining the path', async () => {
    await writeFile(join(workspace, 'report.txt'), 'overridden')

    await expect(loadAttachments([{
      path: 'report.txt',
      filename: 'invoice.pdf',
      contentType: 'application/pdf',
    }], workspace, DEFAULT_ATTACHMENT_LIMITS)).resolves.toEqual([{
      filename: 'invoice.pdf',
      contentType: 'application/pdf',
      content: Buffer.from('overridden'),
      size: 10,
    }])
  })

  it.each([
    'nested/name.txt',
    'nested\\name.txt',
    '../name.txt',
    '',
    ' \t ',
    'bad\nname.txt',
  ])('rejects an unsafe filename override: %j', async filename => {
    await writeFile(join(workspace, 'report.txt'), 'override')

    await expect(loadAttachments([{ path: 'report.txt', filename }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_INVALID_FILENAME' })
  })

  it.each(['', ' \t ', 'text/plain\r\nBcc: attacker@example.test'])('rejects an unsafe content-type override: %j', async contentType => {
    await writeFile(join(workspace, 'report.txt'), 'override')

    await expect(loadAttachments([{ path: 'report.txt', contentType }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_INVALID_CONTENT_TYPE' })
  })

  it('uses the binary fallback when a filename has no known MIME type', async () => {
    await writeFile(join(workspace, 'report.unknown-extension'), 'binary')

    await expect(loadAttachments([{ path: 'report.unknown-extension' }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .resolves.toMatchObject([{ contentType: 'application/octet-stream' }])
  })

  it('rejects a parent traversal request that escapes the workspace', async () => {
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
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_TOO_LARGE' })
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
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_TOO_LARGE' })
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

  it('reads the opened file when its path is replaced by an outside symlink', async () => {
    const target = join(workspace, 'safe.txt')
    const outside = join(fixtureRoot, 'outside.txt')
    await writeFile(target, 'safe content')
    await writeFile(outside, 'outside content')
    const loader = createAttachmentLoaderForTesting({
      afterOpen: async path => {
        await rename(path, join(workspace, 'held-safe.txt'))
        await symlink(outside, path)
      },
    })

    await expect(loader([{ path: 'safe.txt' }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .resolves.toMatchObject([{ filename: 'safe.txt', content: Buffer.from('safe content'), size: 12 }])
  })

  it('rejects an identity replacement between pathname validation and open', async () => {
    const target = join(workspace, 'report.txt')
    const replacement = join(workspace, 'replacement.txt')
    await writeFile(target, 'original')
    await writeFile(replacement, 'replacement')
    const loader = createAttachmentLoaderForTesting({
      beforeOpen: async path => rename(replacement, path),
    })

    await expect(loader([{ path: 'report.txt' }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_CHANGED' })
  })

  it('rejects a non-regular replacement between pathname validation and open', async () => {
    const target = join(workspace, 'report.txt')
    await writeFile(target, 'original')
    const loader = createAttachmentLoaderForTesting({
      beforeOpen: async path => {
        await rm(path)
        await mkdir(path)
      },
    })

    await expect(loader([{ path: 'report.txt' }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_NOT_REGULAR' })
  })

  it('rejects content that grows after metadata validation', async () => {
    const target = join(workspace, 'report.txt')
    await writeFile(target, 'small')
    const loader = createAttachmentLoaderForTesting({
      afterMetadata: async path => appendFile(path, ' but now larger'),
    })

    await expect(loader([{ path: 'report.txt' }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_CHANGED' })
  })

  it('closes an opened handle when cancellation interrupts before reads', async () => {
    await writeFile(join(workspace, 'report.txt'), 'abort')
    const controller = new AbortController()
    let closed = 0
    const loader = createAttachmentLoaderForTesting({
      afterMetadata: () => controller.abort(),
      afterClose: () => { closed += 1 },
    })

    await expect(loader([{ path: 'report.txt' }], workspace, DEFAULT_ATTACHMENT_LIMITS, controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(closed).toBe(1)
  })

  it('rejects an outside symlink replacement before pathname stat without reading its secret', async () => {
    const target = join(workspace, 'report.txt')
    const outside = join(fixtureRoot, 'outside.txt')
    await writeFile(target, 'safe')
    await writeFile(outside, 'outside secret')
    const loader = createAttachmentLoaderForTesting({
      beforePathStat: async path => {
        await rm(path)
        await symlink(outside, path)
      },
    })

    await expect(loader([{ path: 'report.txt' }], workspace, DEFAULT_ATTACHMENT_LIMITS))
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_OUTSIDE_WORKSPACE' })
  })

  it('enforces the individual limit against a file that grows after metadata checks', async () => {
    const target = join(workspace, 'report.txt')
    await writeFile(target, 'small')
    const loader = createAttachmentLoaderForTesting({
      afterMetadata: async path => appendFile(path, ' larger'),
    })
    const limits = { maxFiles: 1, maxFileBytes: 10, maxTotalBytes: 20 }

    await expect(loader([{ path: 'report.txt' }], workspace, limits))
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_TOO_LARGE' })
  })

  it('enforces the total limit against files that grow after metadata checks', async () => {
    await writeFile(join(workspace, 'first.txt'), 'first')
    await writeFile(join(workspace, 'second.txt'), 'other')
    const loader = createAttachmentLoaderForTesting({
      afterMetadata: async path => {
        if (path.endsWith('second.txt')) await appendFile(path, '!')
      },
    })
    const limits = { maxFiles: 2, maxFileBytes: 10, maxTotalBytes: 10 }

    await expect(loader([{ path: 'first.txt' }, { path: 'second.txt' }], workspace, limits))
      .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_TOO_LARGE' })
  })
})

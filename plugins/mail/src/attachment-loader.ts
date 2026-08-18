import { readFile, realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { lookup } from 'mime-types'
import type {
  LoadedMailAttachment,
  MailAttachmentLimits,
  MailAttachmentRequest,
} from './mail-types.ts'

const MEBIBYTE = 1024 * 1024

/** Limits for workspace files accepted by the mail send operation. */
export const DEFAULT_ATTACHMENT_LIMITS: MailAttachmentLimits = Object.freeze({
  maxFiles: 10,
  maxFileBytes: 10 * MEBIBYTE,
  maxTotalBytes: 25 * MEBIBYTE,
})

type AttachmentErrorCode =
  | 'MAIL_ATTACHMENT_INVALID_FILENAME'
  | 'MAIL_ATTACHMENT_LIMIT_EXCEEDED'
  | 'MAIL_ATTACHMENT_NOT_REGULAR'
  | 'MAIL_ATTACHMENT_OUTSIDE_WORKSPACE'
  | 'MAIL_ATTACHMENT_WORKSPACE_UNAVAILABLE'

class MailAttachmentError extends Error {
  constructor(readonly code: AttachmentErrorCode, message: string) {
    super(message)
    this.name = 'MailAttachmentError'
  }
}

interface ValidatedAttachment {
  path: string
  filename: string
  contentType: string
  size: number
}

function attachmentError(code: AttachmentErrorCode, message: string): MailAttachmentError {
  return new MailAttachmentError(code, message)
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason
}

function hasParentSegment(path: string): boolean {
  return path.split(/[\\/]+/u).includes('..')
}

function isInsideWorkspace(workspace: string, target: string): boolean {
  const pathFromWorkspace = relative(workspace, target)
  return pathFromWorkspace !== '..'
    && !pathFromWorkspace.startsWith(`..${sep}`)
    && !isAbsolute(pathFromWorkspace)
}

async function canonicalWorkspace(workspace: string, signal: AbortSignal | undefined): Promise<string> {
  throwIfAborted(signal)
  try {
    const canonical = await realpath(workspace)
    throwIfAborted(signal)
    if (!(await stat(canonical)).isDirectory()) {
      throw attachmentError('MAIL_ATTACHMENT_WORKSPACE_UNAVAILABLE', 'Attachment workspace is not a directory')
    }
    return canonical
  } catch (error) {
    if (error instanceof MailAttachmentError) throw error
    throwIfAborted(signal)
    throw attachmentError('MAIL_ATTACHMENT_WORKSPACE_UNAVAILABLE', 'Attachment workspace is unavailable')
  }
}

async function readAttachment(path: string, signal: AbortSignal | undefined): Promise<Buffer> {
  throwIfAborted(signal)
  const content = signal === undefined ? await readFile(path) : await readFile(path, { signal })
  throwIfAborted(signal)
  return content
}

/**
 * Loads only regular files canonically contained by a session workspace.
 * Metadata and cumulative limits are validated before any file content is read.
 */
export async function loadAttachments(
  requests: readonly MailAttachmentRequest[],
  workspace: string,
  limits: MailAttachmentLimits = DEFAULT_ATTACHMENT_LIMITS,
  signal?: AbortSignal,
): Promise<LoadedMailAttachment[]> {
  throwIfAborted(signal)
  if (requests.length > limits.maxFiles) {
    throw attachmentError('MAIL_ATTACHMENT_LIMIT_EXCEEDED', 'Too many attachments')
  }

  const canonical = await canonicalWorkspace(workspace, signal)
  const validated: ValidatedAttachment[] = []
  let totalSize = 0

  for (const request of requests) {
    throwIfAborted(signal)
    if (hasParentSegment(request.path)) {
      throw attachmentError('MAIL_ATTACHMENT_OUTSIDE_WORKSPACE', 'Attachment path must not contain parent traversal')
    }

    const candidate = isAbsolute(request.path)
      ? resolve(request.path)
      : resolve(canonical, request.path)

    let target: string
    try {
      target = await realpath(candidate)
    } catch {
      throwIfAborted(signal)
      throw attachmentError('MAIL_ATTACHMENT_NOT_REGULAR', 'Attachment file is unavailable')
    }
    throwIfAborted(signal)

    if (!isInsideWorkspace(canonical, target)) {
      throw attachmentError('MAIL_ATTACHMENT_OUTSIDE_WORKSPACE', 'Attachment file is outside the workspace')
    }

    const filename = basename(target)
    if (/[\r\n]/u.test(filename)) {
      throw attachmentError('MAIL_ATTACHMENT_INVALID_FILENAME', 'Attachment filename must not contain CR or LF')
    }

    const metadata = await stat(target)
    throwIfAborted(signal)
    if (!metadata.isFile()) {
      throw attachmentError('MAIL_ATTACHMENT_NOT_REGULAR', 'Attachment must be a regular file')
    }
    if (metadata.size > limits.maxFileBytes) {
      throw attachmentError('MAIL_ATTACHMENT_LIMIT_EXCEEDED', 'Attachment file exceeds the size limit')
    }

    totalSize += metadata.size
    if (totalSize > limits.maxTotalBytes) {
      throw attachmentError('MAIL_ATTACHMENT_LIMIT_EXCEEDED', 'Attachments exceed the total size limit')
    }

    validated.push({
      path: target,
      filename,
      contentType: lookup(filename) || 'application/octet-stream',
      size: metadata.size,
    })
  }

  return Promise.all(validated.map(async attachment => ({
    filename: attachment.filename,
    contentType: attachment.contentType,
    content: await readAttachment(attachment.path, signal),
    size: attachment.size,
  })))
}

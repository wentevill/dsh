import type {
  LoadedMailAttachment,
  MailAttachmentLimits,
  MailAttachmentRequest,
} from './mail-types.ts'
import { loadAttachments } from './attachment-loader.ts'

const TEST_HOOKS_KEY = Symbol.for('dsh-mail.attachment-loader.test-hooks')

interface AttachmentLoaderHooks {
  beforePathStat?(path: string): Promise<void> | void
  beforeOpen?(path: string): Promise<void> | void
  afterOpen?(path: string): Promise<void> | void
  afterMetadata?(path: string): Promise<void> | void
  afterClose?(path: string): Promise<void> | void
}

export function createAttachmentLoaderForTesting(hooks: AttachmentLoaderHooks) {
  return async (
    requests: readonly MailAttachmentRequest[],
    workspace: string,
    limits: MailAttachmentLimits,
    signal?: AbortSignal,
  ): Promise<LoadedMailAttachment[]> => {
    const globals = globalThis as { [TEST_HOOKS_KEY]?: AttachmentLoaderHooks }
    if (globals[TEST_HOOKS_KEY] !== undefined) throw new Error('attachment loader test hooks are already active')
    globals[TEST_HOOKS_KEY] = hooks
    try {
      return await loadAttachments(requests, workspace, limits, signal)
    } finally {
      delete globals[TEST_HOOKS_KEY]
    }
  }
}

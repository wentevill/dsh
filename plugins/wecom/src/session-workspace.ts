import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import z from '@deepseek-ai/schemastery'

const SESSION_TOKEN = '{{session}}'

export function defaultSessionWorkspaceTemplate(): string {
  return join(tmpdir(), 'deepseek-harness-wecom', SESSION_TOKEN)
}

export const sessionWorkspaceTemplateSchema = z.string().default(defaultSessionWorkspaceTemplate())
sessionWorkspaceTemplateSchema.meta.description = {
  en: 'Absolute workspace path template for WeCom sessions. {{session}} is replaced with the Harness Session ID; omit it to share one directory.',
  'zh-CN': '企业微信会话的绝对工作目录模板。{{session}} 会替换为 Harness Session ID；省略该占位符时所有会话共用同一目录。',
}

export function resolveSessionWorkspace(template: string, sessionId: SessionId): string {
  const workspace = template.replaceAll(SESSION_TOKEN, sessionId)
  if (!isAbsolute(workspace)) throw new Error('WeCom sessionWorkspaceTemplate must be absolute')
  return workspace
}

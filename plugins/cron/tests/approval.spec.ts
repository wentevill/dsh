import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import { createCronApprovalPolicy } from '../src/approval.ts'

function execution(name: string, args: Record<string, unknown> = {}): ToolExecution {
  return { name, arguments: args } as unknown as ToolExecution
}

describe('createCronApprovalPolicy', () => {
  const policy = createCronApprovalPolicy()

  it.each(['cron_create', 'cron_update', 'cron_delete', 'cron_resume'])(
    '%s asks for confirmation',
    async (name) => {
      const next = vi.fn(async () => ({ kind: 'allow' as const }))
      expect(await policy(execution(name, {
        name: '日报', expression: ' 0  9 * * * ', prompt: 'private prompt', cronId: 'foreign-id',
      }), next)).toMatchObject({ kind: 'ask' })
      const decision = await policy(execution(name, {
        name: '日报', expression: ' 0  9 * * * ', prompt: 'private prompt', cronId: 'foreign-id',
      }), next)
      expect(decision.kind === 'ask' ? decision.reason : '').not.toContain('private prompt')
      expect(decision.kind === 'ask' ? decision.reason : '').not.toContain('foreign-id')
      expect(next).not.toHaveBeenCalled()
    },
  )

  it.each(['cron_pause', 'cron_list', 'cron_history', 'cron_open_manager', 'other_tool'])(
    '%s delegates',
    async (name) => {
      const next = vi.fn(async () => ({ kind: 'allow' as const }))
      await expect(policy(execution(name), next)).resolves.toEqual({ kind: 'allow' })
      expect(next).toHaveBeenCalledOnce()
    },
  )
})

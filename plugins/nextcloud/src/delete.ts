import type { Context } from '@deepseek-ai/cordis'
import { mountNextcloudDeleteComponent } from './tools.ts'

export const name = 'nextcloud-delete'
export const inject = ['tools', 'nextcloudRuntime']

export function apply(ctx: Context): void {
  mountNextcloudDeleteComponent(ctx)
}

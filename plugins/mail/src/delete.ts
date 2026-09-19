import type { Context } from '@deepseek-ai/cordis'
import { mountMailDeleteComponent } from './tools.ts'

export const name = 'mail-delete'
export const inject = ['tools', 'mailRuntime']

export function apply(ctx: Context): void {
  mountMailDeleteComponent(ctx)
}

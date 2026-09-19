import type { Context } from '@deepseek-ai/cordis'
import { mountConfluenceDeleteComponent } from './tools.ts'

export const name = 'confluence-delete'
export const inject = ['tools', 'confluenceRuntime']

export function apply(ctx: Context): void {
  mountConfluenceDeleteComponent(ctx)
}

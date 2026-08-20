import { isAbsolute, join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  defaultSessionWorkspaceTemplate,
  resolveSessionWorkspace,
  sessionWorkspaceTemplateSchema,
} from '../src/session-workspace.js'

describe('WeCom session workspace template', () => {
  it('defaults to one isolated directory per Session under the OS temp directory', () => {
    const template = defaultSessionWorkspaceTemplate()
    expect(template).toBe(join(tmpdir(), 'deepseek-harness-wecom', '{{session}}'))
    expect(isAbsolute(template)).toBe(true)
  })

  it('replaces every session token', () => {
    expect(resolveSessionWorkspace('/tmp/{{session}}/mirror-{{session}}', 'wecom-1' as never))
      .toBe('/tmp/wecom-1/mirror-wecom-1')
  })

  it('uses one shared absolute directory when the token is absent', () => {
    expect(resolveSessionWorkspace('/tmp/wecom-shared', 'wecom-1' as never))
      .toBe('/tmp/wecom-shared')
  })

  it('rejects relative templates', () => {
    expect(() => resolveSessionWorkspace('relative/{{session}}', 'wecom-1' as never))
      .toThrow('absolute')
  })

  it('exposes the default and bilingual Plugin configuration copy', () => {
    expect(sessionWorkspaceTemplateSchema()).toBe(defaultSessionWorkspaceTemplate())
    expect(sessionWorkspaceTemplateSchema.meta.description).toMatchObject({
      en: expect.stringContaining('{{session}}'),
      'zh-CN': expect.stringContaining('{{session}}'),
    })
  })
})

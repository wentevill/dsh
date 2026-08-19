import { describe, expect, it } from 'vitest'
import { adaptRequestSchema, normalizeToolName } from '../src/schema-adapter.ts'

describe('WeCom schema adapter', () => {
  it('normalizes a complete method path into a stable tool name', () => {
    expect(normalizeToolName(['message', 'aibot', 'sessions', 'list'])).toBe('wecom_message_aibot_sessions_list')
  })

  it('converts objects, required properties, arrays, enums, and nested values', () => {
    const schemas = {
      Request: {
        type: 'object',
        required: ['keywords'],
        additionalProperties: false,
        properties: {
          keywords: { type: 'array', items: { type: 'string' }, description: '关键词' },
          mode: { type: 'string', enum: ['best', 'list'] },
          limit: { type: 'integer' },
        },
      },
    }
    expect(adaptRequestSchema('Request', schemas)).toEqual({
      keywords: { type: 'array', required: true, description: '关键词', items: { type: 'string' } },
      mode: { type: 'string', enum: ['best', 'list'] },
      limit: { type: 'number' },
    })
  })

  it('returns a diagnostic for unsupported unions instead of weakening validation', () => {
    expect(() => adaptRequestSchema('Request', {
      Request: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    })).toThrow('unsupported oneOf')
  })
})

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

  it('expands nested schema references used by AI Bot message content', () => {
    const schemas = {
      SendAibotMessageReq: {
        type: 'object',
        required: ['chat_id', 'msg_type'],
        properties: {
          chat_id: { type: 'string' },
          msg_type: { type: 'string', enum: ['markdown'] },
          markdown: {
            type: 'object',
            '$ref': 'AibotMarkdownContent',
            description: 'markdown 消息内容',
          },
        },
      },
      AibotMarkdownContent: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', description: 'markdown 正文' },
        },
      },
    }

    expect(adaptRequestSchema('SendAibotMessageReq', schemas)).toMatchObject({
      markdown: {
        type: 'object',
        description: 'markdown 消息内容',
        properties: {
          content: { type: 'string', required: true, description: 'markdown 正文' },
        },
        additionalProperties: false,
      },
    })
  })

  it('returns a diagnostic for unsupported unions instead of weakening validation', () => {
    expect(() => adaptRequestSchema('Request', {
      Request: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    })).toThrow('unsupported oneOf')
  })

  it('rejects cyclic nested schema references', () => {
    expect(() => adaptRequestSchema('Request', {
      Request: { type: 'object', properties: { nested: { '$ref': 'Nested' } } },
      Nested: { type: 'object', properties: { parent: { '$ref': 'Nested' } } },
    })).toThrow('cyclic WeCom schema reference: Nested')
  })
})

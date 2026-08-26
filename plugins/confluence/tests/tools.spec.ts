import { describe, expect, it, vi } from 'vitest'
import type { ToolDefinition, ToolExecution, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { ConfluenceCapabilityManager } from '../src/tools.ts'
import { createConfluenceApprovalPolicy } from '../src/approval.ts'
import type { ConfluenceSettings } from '../src/settings.ts'

const settings: ConfluenceSettings = {
  baseUrl: 'https://wiki.example.test/confluence',
  allowAllSpaces: false, allowedSpaceKeys: ['ENG'],
}

function execution(name: string, arguments_: unknown): ToolRunContext {
  return {
    callId: 'call-1', rootCallId: 'call-1', name, arguments: arguments_, token: Symbol(name),
    signal: new AbortController().signal, agent: {} as never, deferContext() {}, concludeTurn() {},
  } as unknown as ToolRunContext
}

function fixture() {
  const definitions = new Map<string, ToolDefinition>()
  const transport: any = {
    searchPages: vi.fn(async () => ({ results: [], start: 0, limit: 10, size: 0 })),
    readPage: vi.fn(async (_connection, id: string) => ({
      id, type: 'page', title: 'Roadmap', space: { key: 'ENG' }, version: { number: 3 },
      body: { storage: { value: '<p>Untrusted body</p>' } }, _links: { webui: '/display/ENG/Roadmap' },
    })),
    createPage: vi.fn(async (_connection, request) => ({
      id: '101', type: 'page', title: request.title, space: { key: request.spaceKey }, version: { number: 1 },
    })),
    updatePage: vi.fn(async (_connection, request) => ({
      id: request.pageId, type: 'page', title: request.title, space: { key: 'ENG' }, version: { number: request.nextVersion },
    })),
  }
  const manager = new ConfluenceCapabilityManager({
    tools: { register(definition) { definitions.set(definition.name, definition); return () => { definitions.delete(definition.name) } } },
    scope: { get: () => settings, watch: () => () => {} },
    credentials: { resolve: vi.fn(async () => ({ value: 'pat' })) },
    transport: transport as never,
  })
  return { manager, definitions, transport }
}

describe('Confluence capability manager', () => {
  it('registers tools only while a complete space policy is configured', async () => {
    let current: ConfluenceSettings = { ...settings, baseUrl: '', allowedSpaceKeys: [] }
    let listener: (() => void | Promise<void>) | undefined
    const definitions = new Map<string, ToolDefinition>()
    new ConfluenceCapabilityManager({
      tools: { register(definition) { definitions.set(definition.name, definition); return () => { definitions.delete(definition.name) } } },
      scope: { get: () => current, watch: value => { listener = value; return () => {} } },
      credentials: { resolve: vi.fn() }, transport: {} as never,
    })
    expect(definitions.size).toBe(0)
    current = settings
    await listener?.()
    expect(definitions.size).toBe(4)
    current = { ...settings, baseUrl: '', allowedSpaceKeys: [] }
    await listener?.()
    expect(definitions.size).toBe(0)
  })

  it('registers the exact four-tool catalog and bounds search to allowed spaces', async () => {
    const { definitions, transport } = fixture()
    expect([...definitions.keys()].sort()).toEqual([
      'confluence_create_page', 'confluence_read_page', 'confluence_search_pages', 'confluence_update_page',
    ])
    transport.searchPages.mockResolvedValueOnce({
      results: [{
        title: 'Roadmap', excerpt: 'Highlighted roadmap text', lastModified: '2026-08-26',
        entity: { id: '100', type: 'page', title: 'Roadmap', space: { key: 'ENG' }, version: { number: 3 } },
      }], start: 0, limit: 10, size: 1,
    })
    const result = await definitions.get('confluence_search_pages')!.execute({ query: 'roadmap', spaceKeys: ['ENG'] }, execution('confluence_search_pages', {}))
    expect(transport.searchPages).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cql: expect.stringContaining('space IN ("ENG")') }), expect.anything())
    expect(result).toContain('Highlighted roadmap text')
  })

  it('marks read content as untrusted and rejects pages returned outside the allowlist', async () => {
    const { definitions, transport } = fixture()
    const read = definitions.get('confluence_read_page')!
    await expect(read.execute({ pageId: '100' }, execution('confluence_read_page', {}))).resolves.toContain('UNTRUSTED CONFLUENCE CONTENT')
    transport.readPage.mockResolvedValueOnce({
      id: '200', type: 'page', title: 'Payroll', space: { key: 'HR' }, version: { number: 1 },
      body: { storage: { value: '<p>secret</p>' } },
    })
    await expect(read.execute({ pageId: '200' }, execution('confluence_read_page', {}))).rejects.toMatchObject({ code: 'CONFLUENCE_SPACE_FORBIDDEN' })
  })

  it('requires a fresh one-shot approval before creating a page', async () => {
    const { manager, definitions, transport } = fixture()
    const args = { spaceKey: 'ENG', title: 'Release', markdown: '# Release\n\nDeployment notes.' }
    const exec = execution('confluence_create_page', args)
    await expect(definitions.get(exec.name)!.execute(args, exec)).rejects.toMatchObject({ code: 'CONFLUENCE_INPUT_INVALID' })

    const decision = await createConfluenceApprovalPolicy(manager)(exec, async () => ({ kind: 'allow' }))
    expect(decision).toMatchObject({ kind: 'ask', reason: expect.stringContaining('Release') })
    expect((decision as { reason: string }).reason).toContain('Deployment notes')
    await definitions.get(exec.name)!.execute(args, exec)
    expect(transport.createPage).toHaveBeenCalledTimes(1)
    await expect(definitions.get(exec.name)!.execute(args, exec)).rejects.toMatchObject({ code: 'CONFLUENCE_INPUT_INVALID' })
  })

  it('includes every consequential create field in the approval prompt', async () => {
    const { manager } = fixture()
    const exec = execution('confluence_create_page', {
      spaceKey: 'ENG', title: 'Release', markdown: 'notes', parentPageId: '42', versionMessage: 'publish release',
    })
    const decision = await createConfluenceApprovalPolicy(manager)(exec, async () => ({ kind: 'allow' }))
    expect((decision as { reason: string }).reason).toContain('parent "42"')
    expect((decision as { reason: string }).reason).toContain('publish release')
  })

  it('rejects a created page returned outside the allowlist', async () => {
    const { manager, definitions, transport } = fixture()
    transport.createPage.mockResolvedValueOnce({
      id: '101', type: 'page', title: 'Release', space: { key: 'HR' }, version: { number: 1 },
    })
    const args = { spaceKey: 'ENG', title: 'Release', markdown: 'notes' }
    const exec = execution('confluence_create_page', args)
    await createConfluenceApprovalPolicy(manager)(exec, async () => ({ kind: 'allow' }))
    await expect(definitions.get(exec.name)!.execute(args, exec)).rejects.toMatchObject({ code: 'CONFLUENCE_SPACE_FORBIDDEN' })
  })

  it('rejects an update approval when expectedVersion is stale', async () => {
    const { manager, definitions, transport } = fixture()
    const args = { pageId: '100', expectedVersion: 2, markdown: 'changed' }
    const exec = execution('confluence_update_page', args)
    await expect(createConfluenceApprovalPolicy(manager)(exec, async () => ({ kind: 'allow' }))).rejects.toMatchObject({ code: 'CONFLUENCE_CONFLICT' })
    expect(transport.updatePage).not.toHaveBeenCalled()
  })

  it('describes the authoritative update target and requested changes', async () => {
    const { manager } = fixture()
    const exec = execution('confluence_update_page', {
      pageId: '100', expectedVersion: 3, title: 'New roadmap', markdown: 'changed', versionMessage: 'quarterly refresh',
    })
    const decision = await createConfluenceApprovalPolicy(manager)(exec, async () => ({ kind: 'allow' }))
    expect((decision as { reason: string }).reason).toContain('"Roadmap"')
    expect((decision as { reason: string }).reason).toContain('space "ENG"')
    expect((decision as { reason: string }).reason).toContain('"New roadmap"')
    expect((decision as { reason: string }).reason).toContain('quarterly refresh')
  })

  it('neutralizes format controls in every untrusted approval field', async () => {
    const { manager, transport } = fixture()
    transport.readPage.mockResolvedValueOnce({
      id: '100', type: 'page', title: `Road\u202Emap`, space: { key: 'ENG' }, version: { number: 3 },
    })
    const exec = execution('confluence_update_page', {
      pageId: '100', expectedVersion: 3, title: `New\u202Etitle`, markdown: 'changed', versionMessage: `publish\u202Enow`,
    })
    const decision = await createConfluenceApprovalPolicy(manager)(exec, async () => ({ kind: 'allow' }))
    expect((decision as { reason: string }).reason).not.toContain('\u202E')
  })

  it('aborts a create before the write when settings change during the parent check', async () => {
    let current = settings
    let listener: (() => void | Promise<void>) | undefined
    let release!: () => void
    const parentPending = new Promise<void>(resolve => { release = resolve })
    const definitions = new Map<string, ToolDefinition>()
    const transport: any = {
      readPage: vi.fn(async (_connection, id: string) => {
        await parentPending
        return { id, type: 'page', title: 'Parent', space: { key: 'ENG' }, version: { number: 1 } }
      }),
      createPage: vi.fn(), searchPages: vi.fn(), updatePage: vi.fn(),
    }
    const manager = new ConfluenceCapabilityManager({
      tools: { register(definition) { definitions.set(definition.name, definition); return () => { definitions.delete(definition.name) } } },
      scope: { get: () => current, watch: value => { listener = value; return () => {} } },
      credentials: { resolve: vi.fn(async () => ({ value: 'pat' })) }, transport,
    })
    const args = { spaceKey: 'ENG', title: 'Child', markdown: 'body', parentPageId: '42' }
    const exec = execution('confluence_create_page', args)
    await createConfluenceApprovalPolicy(manager)(exec, async () => ({ kind: 'allow' }))
    const create = definitions.get(exec.name)!
    const pending = create.execute(args, exec)
    current = { ...settings, allowedSpaceKeys: ['OPS'] }
    await listener?.()
    release()
    await expect(pending).rejects.toMatchObject({ code: 'CONFLUENCE_INPUT_INVALID' })
    expect(transport.createPage).not.toHaveBeenCalled()
  })
})

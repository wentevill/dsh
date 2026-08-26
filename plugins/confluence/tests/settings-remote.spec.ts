import { describe, expect, it, vi } from 'vitest'
import { confluencePatRef, saveConfluenceSettings, saveVerifiedConfluenceSettings, testConfluenceConnection } from '../src/remote-settings.ts'

const configured = {
  baseUrl: 'https://wiki.example.test/confluence',
  allowAllSpaces: false, allowedSpaceKeys: ['ENG', 'DOCS'],
}

describe('Confluence settings Remote operations', () => {
  it('validates and replaces the complete non-secret settings section', async () => {
    let current = configured
    const scope = { get: () => current, replace: vi.fn(async value => { current = value }) }
    await expect(saveConfluenceSettings(scope, { settings: { ...configured, baseUrl: `${configured.baseUrl}/` } })).resolves.toEqual({
      settings: configured,
      patRef: confluencePatRef(configured.baseUrl),
    })
    expect(scope.replace).toHaveBeenCalledWith(configured)
  })

  it('uses a different credential reference for every normalized base URL', () => {
    expect(confluencePatRef('https://wiki.example.test/confluence')).not.toBe(confluencePatRef('https://other.example.test/confluence'))
    expect(confluencePatRef('https://wiki.example.test/confluence/')).toBe(confluencePatRef('https://wiki.example.test/confluence'))
  })

  it('tests the PAT, minimum version, and every allowlisted space', async () => {
    const transport = {
      serverInformation: vi.fn(async () => ({ version: '9.2.1', buildNumber: 123 })),
      getSpace: vi.fn(async (_connection, key: string) => ({ key, name: key })),
    }
    await expect(testConfluenceConnection(configured, {
      credentials: { resolve: vi.fn(async () => ({ value: 'pat' })) }, transport,
    })).resolves.toEqual({ ok: true, version: '9.2.1', buildNumber: 123, verifiedSpaces: ['ENG', 'DOCS'] })
    expect(transport.getSpace).toHaveBeenCalledTimes(2)
  })

  it('rejects Data Center versions older than PAT support', async () => {
    await expect(testConfluenceConnection(configured, {
      credentials: { resolve: vi.fn(async () => ({ value: 'pat' })) },
      transport: { serverInformation: vi.fn(async () => ({ version: '7.8.9', buildNumber: 1 })), getSpace: vi.fn() },
    })).rejects.toThrow(/7\.9/u)
  })

  it('falls back to a space probe when Confluence 7/8 has no server-information endpoint', async () => {
    const notFound = Object.assign(new Error('not found'), { code: 'CONFLUENCE_NOT_FOUND' })
    const transport = {
      serverInformation: vi.fn(async () => { throw notFound }),
      probeSpaces: vi.fn(async () => ({ results: [{ key: 'ENG' }] })),
      getSpace: vi.fn(),
    }
    await expect(testConfluenceConnection({ ...configured, allowAllSpaces: true, allowedSpaceKeys: [] }, {
      credentials: { resolve: vi.fn(async () => ({ value: 'pat' })) }, transport,
    })).resolves.toEqual({ ok: true, version: '7.9–8.x', buildNumber: 0, verifiedSpaces: [] })
    expect(transport.probeSpaces).toHaveBeenCalledTimes(1)
  })

  it('does not hide authentication failures behind the legacy fallback', async () => {
    const unauthorized = Object.assign(new Error('unauthorized'), { code: 'CONFLUENCE_UNAUTHORIZED' })
    const transport = { serverInformation: vi.fn(async () => { throw unauthorized }), probeSpaces: vi.fn(), getSpace: vi.fn() }
    await expect(testConfluenceConnection(configured, {
      credentials: { resolve: vi.fn(async () => ({ value: 'pat' })) }, transport,
    })).rejects.toBe(unauthorized)
    expect(transport.probeSpaces).not.toHaveBeenCalled()
  })

  it('does not activate settings until the site and allowlist verify successfully', async () => {
    let current = { ...configured, baseUrl: '', allowedSpaceKeys: [] }
    const scope = { get: () => current, replace: vi.fn(async value => { current = value }) }
    await expect(saveVerifiedConfluenceSettings(scope, { settings: configured }, {
      credentials: { resolve: vi.fn(async () => ({ value: 'pat' })) },
      transport: { serverInformation: vi.fn(async () => { throw new Error('offline') }), getSpace: vi.fn() },
    })).rejects.toThrow('offline')
    expect(scope.replace).not.toHaveBeenCalled()
  })

  it('rejects a space lookup that returns a different key', async () => {
    await expect(testConfluenceConnection(configured, {
      credentials: { resolve: vi.fn(async () => ({ value: 'pat' })) },
      transport: {
        serverInformation: vi.fn(async () => ({ version: '9.2.1', buildNumber: 123 })),
        getSpace: vi.fn(async () => ({ key: 'HR' })),
      },
    })).rejects.toMatchObject({ code: 'CONFLUENCE_RESPONSE_INVALID' })
  })
})

import { createHash } from 'node:crypto'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { confluenceError } from './errors.ts'
import type { ConfluenceConnectionResult, ConfluenceSettingsSaveRequest, ConfluenceSettingsSaveResult } from './remote-types.ts'
import { normalizeBaseUrl, normalizeConfluenceSettings, type ConfluenceSettings } from './settings.ts'
import type { FetchConfluenceTransport } from './transport.ts'

interface MutableSettingsScope {
  get(): ConfluenceSettings
  replace(settings: ConfluenceSettings): Promise<void>
}

export async function saveConfluenceSettings(
  scope: MutableSettingsScope,
  request: ConfluenceSettingsSaveRequest,
): Promise<ConfluenceSettingsSaveResult> {
  const settings = normalizeConfluenceSettings(request.settings)
  await scope.replace(settings)
  return { settings: scope.get(), patRef: confluencePatRef(settings.baseUrl) }
}

export async function saveVerifiedConfluenceSettings(
  scope: MutableSettingsScope,
  request: ConfluenceSettingsSaveRequest,
  options: ConnectionTestOptions,
): Promise<ConfluenceSettingsSaveResult> {
  await testConfluenceConnection(request.settings, options)
  return saveConfluenceSettings(scope, request)
}

export function confluencePatRef(baseUrl: string): string {
  const digest = createHash('sha256').update(normalizeBaseUrl(baseUrl)).digest('hex').slice(0, 24).toUpperCase()
  return `CONFLUENCE_PAT_${digest}`
}

interface ConnectionTestOptions {
  credentials: { resolve(reference: ReturnType<typeof credentialRef>): Promise<{ value: string } | undefined> }
  transport: Pick<FetchConfluenceTransport, 'serverInformation' | 'probeSpaces' | 'getSpace'>
}

function supportsPat(version: string): boolean {
  const match = /^(\d+)\.(\d+)(?:\.|$)/u.exec(version)
  return match !== null && (Number(match[1]) > 7 || (Number(match[1]) === 7 && Number(match[2]) >= 9))
}

export async function testConfluenceConnection(
  input: ConfluenceSettings,
  options: ConnectionTestOptions,
): Promise<ConfluenceConnectionResult> {
  const settings = normalizeConfluenceSettings(input)
  const credential = await options.credentials.resolve(credentialRef(confluencePatRef(settings.baseUrl)))
  if (credential === undefined || credential.value === '') throw confluenceError('personal access token is not configured', 'CONFLUENCE_UNAUTHORIZED')
  const connection = { baseUrl: settings.baseUrl, token: credential.value }
  let information: { version: string; buildNumber: number }
  try {
    information = await options.transport.serverInformation(connection)
    if (!supportsPat(information.version)) throw confluenceError('Confluence Data Center 7.9 or newer is required for PAT authentication', 'CONFLUENCE_RESPONSE_INVALID')
  } catch (cause) {
    if ((cause as { code?: unknown })?.code !== 'CONFLUENCE_NOT_FOUND') throw cause
    await options.transport.probeSpaces(connection)
    information = { version: '7.9–8.x', buildNumber: 0 }
  }
  const verifiedSpaces: string[] = []
  if (!settings.allowAllSpaces) {
    for (const key of settings.allowedSpaceKeys) {
      const space = await options.transport.getSpace(connection, key)
      if (space.key.toUpperCase() !== key.toUpperCase()) throw confluenceError('Confluence returned a mismatched space', 'CONFLUENCE_RESPONSE_INVALID')
      verifiedSpaces.push(space.key)
    }
  }
  return { ok: true, version: information.version, buildNumber: information.buildNumber, verifiedSpaces }
}

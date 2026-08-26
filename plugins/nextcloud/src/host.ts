import { createHash } from 'node:crypto'
import { credentialRef, type Credentials } from '@deepseek-ai/dsh-credentials'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import { NextcloudFileService } from './service.ts'
import { NextcloudSharingService } from './sharing-service.ts'
import { NEXTCLOUD_PASSWORD_REF, normalizeNextcloudSettings, type NextcloudSettings, type ResolvedNextcloudSettings } from './settings.ts'
import { createNextcloudTransport, type NextcloudTransport } from './transport.ts'
import type { ResolveService } from './tools.ts'

export type NextcloudTransportFactory = (settings: ResolvedNextcloudSettings, password: string) => NextcloudTransport

export function createServiceResolver(
  scope: Pick<SettingsScope<NextcloudSettings>, 'get'>,
  credentials: Pick<Credentials, 'resolve'>,
  transportFactory: NextcloudTransportFactory = createNextcloudTransport,
): ResolveService {
  return async () => {
    const current = scope.get()
    if (current.serverUrl.trim() === '' || current.username.trim() === '') throw new Error('Nextcloud account is not configured')
    const settings = normalizeNextcloudSettings(current)
    const credential = await credentials.resolve(credentialRef(NEXTCLOUD_PASSWORD_REF))
    if (credential === undefined) throw new Error('Nextcloud application password is not configured')
    const fingerprint = createHash('sha256').update(JSON.stringify(settings)).update('\0').update(credential.value).digest('hex')
    const transport = transportFactory(settings, credential.value)
    const service = new NextcloudFileService(transport, settings)
    return {
      service,
      sharing: new NextcloudSharingService(transport.sharing, service, settings),
      fingerprint,
    }
  }
}

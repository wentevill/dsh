import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AuthBackend, AuthStatus } from './auth.js'
import type { CliAuthBackend } from './cli-auth-backend.js'
import { createChannelController, type ChannelController } from './channel-state-machine.js'
import type { SdkClient, WeComChannelSnapshot } from './channel-types.js'
import { createHarnessBridgeRuntime, HarnessBridge } from './harness-bridge.js'
import { normalizeInbound } from './message-normalizer.js'
import type { QrAuthManager } from './qr-auth-manager.js'
import { RecentMessageCache } from './recent-message-cache.js'
import { RoomScheduler } from './room-scheduler.js'
import { wecomRoomSessionsSpec } from './room-session-domain.js'
import { RoomSessionStore } from './room-session-store.js'
import { createSdkClientFactory } from './sdk-adapter.js'
import { defaultSessionWorkspaceTemplate, resolveSessionWorkspace } from './session-workspace.js'

export const WECOM_BOT_ID = credentialRef('WECOM_BOT_ID')
export const WECOM_BOT_SECRET = credentialRef('WECOM_BOT_SECRET')
export const WECOM_ROOM_KEY_SALT = credentialRef('WECOM_ROOM_KEY_SALT')

export interface WeComChannelHost {
  readonly authBackend: AuthBackend
  initialize(): Promise<void>
  snapshot(): WeComChannelSnapshot
  dispose(): Promise<void>
}

export async function createWeComChannelHost(
  ctx: Context,
  options: {
    readonly cli: CliAuthBackend
    readonly qr: QrAuthManager
    readonly createController?: typeof createChannelController
    readonly sessionWorkspaceTemplate?: string
  },
): Promise<WeComChannelHost> {
  const domain = await ctx.storageDomain.open(wecomRoomSessionsSpec)
  let salt = await ctx.credentials.resolve(WECOM_ROOM_KEY_SALT)
  if (!salt) {
    await ctx.credentials.set(WECOM_ROOM_KEY_SALT, randomBytes(32).toString('base64url'))
    salt = await ctx.credentials.resolve(WECOM_ROOM_KEY_SALT)
  }
  if (!salt) { await domain.close(); throw new Error('failed to initialize WeCom room-key salt') }

  const roomSessions = new RoomSessionStore({
    table: domain.table('rooms'),
    salt: new Uint8Array(Buffer.from(salt.value, 'base64url')),
    sessionExists: async (id) => ctx.sessions.get(id) !== undefined
      || (await ctx.sessionPersistence.list()).some(header => header.id === id),
    createSessionId: async () => SessionId(`wecom-${randomUUID()}`),
  })
  const scheduler = new RoomScheduler({ concurrency: 4, perRoomCapacity: 8 })
  let controller!: ChannelController
  const sessionWorkspaceTemplate = options.sessionWorkspaceTemplate ?? defaultSessionWorkspaceTemplate()
  const bridge = new HarnessBridge({
    scheduler,
    roomSessions,
    runtime: createHarnessBridgeRuntime(ctx, {
      workspaceFor: sessionId => resolveSessionWorkspace(sessionWorkspaceTemplate, sessionId),
      ensureWorkspace: async path => { await mkdir(path, { recursive: true }) },
    }),
    createStreamId: () => randomUUID(),
    reply: async (context, streamId, content, finish) => {
      const owned = context as { readonly frame: unknown; readonly client: SdkClient }
      await owned.client.reply(owned.frame, streamId, content, finish)
    },
  })
  const recent = new RecentMessageCache()
  controller = (options.createController ?? createChannelController)({
    factory: createSdkClientFactory(),
    onMessage: async (frame, signal, client) => {
      const envelope = await normalizeInbound(frame, {
        signal,
        download: (url, aesKey) => client.download(url, aesKey),
      })
      if (!recent.accept(envelope.botId, envelope.messageId)) return
      await bridge.handle({ ...envelope, replyContext: { frame, client } }, signal)
    },
  })

  let disposed = false
  let suppressCredentialEvents = false
  let restart = Promise.resolve()
  const restartFromCredentials = async () => {
    const botId = await ctx.credentials.resolve(WECOM_BOT_ID)
    const secret = await ctx.credentials.resolve(WECOM_BOT_SECRET)
    if (!botId || !secret) { await controller.stop(); return }
    await controller.start({ botId: botId.value, secret: secret.value })
  }
  const disposeCredentialListener = ctx.on('credentials/updated', (ref) => {
    if (disposed || suppressCredentialEvents || (ref !== WECOM_BOT_ID && ref !== WECOM_BOT_SECRET)) return
    restart = restart.then(restartFromCredentials, restartFromCredentials)
  })

  const status = async (): Promise<AuthStatus> => {
    const [botId, secret] = await Promise.all([
      ctx.credentials.resolve(WECOM_BOT_ID),
      ctx.credentials.resolve(WECOM_BOT_SECRET),
    ])
    return botId && secret ? { authorized: true, botId: botId.value } : { authorized: false }
  }

  const authBackend: AuthBackend = {
    status,
    async connect({ signal, onQr }) {
      const credentials = await options.qr.connect({ signal, onQr })
      const [oldId, oldSecret] = await Promise.all([
        ctx.credentials.resolve(WECOM_BOT_ID), ctx.credentials.resolve(WECOM_BOT_SECRET),
      ])
      suppressCredentialEvents = true
      try {
        await ctx.credentials.set(WECOM_BOT_ID, credentials.botId)
        await ctx.credentials.set(WECOM_BOT_SECRET, credentials.secret)
        await options.cli.provision(credentials.botId, credentials.secret, signal)
        await controller.start(credentials)
      } catch (error) {
        await options.cli.deleteOwnedAuthorization().catch(() => {})
        await restoreCredential(WECOM_BOT_ID, oldId?.value)
        await restoreCredential(WECOM_BOT_SECRET, oldSecret?.value)
        await restartFromCredentials().catch(() => {})
        throw error
      } finally {
        suppressCredentialEvents = false
      }
    },
    async deleteOwnedAuthorization() {
      options.qr.cancel()
      suppressCredentialEvents = true
      try {
        await controller.stop()
        await options.cli.deleteOwnedAuthorization()
        await ctx.credentials.unset(WECOM_BOT_SECRET)
        await ctx.credentials.unset(WECOM_BOT_ID)
      } finally {
        suppressCredentialEvents = false
      }
    },
  }

  async function restoreCredential(ref: typeof WECOM_BOT_ID, value: string | undefined) {
    if (value === undefined) await ctx.credentials.unset(ref)
    else await ctx.credentials.set(ref, value)
  }

  let disposal: Promise<void> | undefined
  return {
    authBackend,
    initialize: restartFromCredentials,
    snapshot: () => controller.snapshot(),
    dispose() {
      disposal ??= (async () => {
        disposed = true
        disposeCredentialListener()
        options.qr.cancel()
        await restart.catch(() => {})
        await controller.stop()
        await bridge.dispose()
        await roomSessions.close()
        await domain.close()
      })()
      return disposal
    },
  }
}

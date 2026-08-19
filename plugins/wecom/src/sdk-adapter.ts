import {
  WSAuthFailureError,
  WSClient,
  WSReconnectExhaustedError,
  type WSClientOptions,
  type WsFrameHeaders,
} from '@wecom/aibot-node-sdk'
import type {
  SdkClient,
  SdkClientFactory,
  SdkErrorCategory,
  SdkEventMap,
} from './channel-types.js'

interface OfficialClient {
  connect(): unknown
  disconnect(): void
  on(event: string, listener: (...args: any[]) => void): unknown
  off(event: string, listener: (...args: any[]) => void): unknown
  replyStream(
    frame: WsFrameHeaders,
    streamId: string,
    content: string,
    finish: boolean,
  ): Promise<unknown>
  downloadFile(url: string, aesKey?: string): Promise<{ buffer: Uint8Array; filename?: string }>
}

type OfficialClientConstructor = new (options: WSClientOptions) => OfficialClient

export interface CategorizedSdkError extends Error {
  readonly category: SdkErrorCategory
}

export function categorizeSdkError(error: unknown): CategorizedSdkError {
  let category: SdkErrorCategory = 'permanent'
  if (error instanceof WSAuthFailureError || hasCategory(error, 'auth')) category = 'auth'
  else if (error instanceof WSReconnectExhaustedError || hasCategory(error, 'network')) category = 'network'
  else if (hasCategory(error, 'timeout') || isTimeout(error)) category = 'timeout'

  const projected = new Error(safeErrorMessage(category)) as CategorizedSdkError
  Object.defineProperty(projected, 'category', { value: category, enumerable: true })
  return projected
}

function hasCategory(error: unknown, category: SdkErrorCategory): boolean {
  return typeof error === 'object' && error !== null && 'category' in error
    && (error as { category?: unknown }).category === category
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && /timeout|timed out/i.test(error.name)
}

function safeErrorMessage(category: SdkErrorCategory): string {
  switch (category) {
    case 'auth': return 'WeCom Bot authentication failed'
    case 'network': return 'WeCom WebSocket connection was interrupted'
    case 'timeout': return 'WeCom WebSocket operation timed out'
    default: return 'WeCom WebSocket operation failed'
  }
}

const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
}

export function createSdkClientFactory(
  options: { Client?: OfficialClientConstructor } = {},
): SdkClientFactory {
  const Client = options.Client ?? (WSClient as unknown as OfficialClientConstructor)
  return {
    create(credentials): SdkClient {
      const client = new Client({
        botId: credentials.botId,
        secret: credentials.secret,
        maxReconnectAttempts: 0,
        maxAuthFailureAttempts: 0,
        maxReplyQueueSize: 32,
        requestTimeout: 10_000,
        heartbeatInterval: 30_000,
        logger: silentLogger,
      })
      return {
        connect: () => { client.connect() },
        disconnect: () => { client.disconnect() },
        on<K extends keyof SdkEventMap>(
          event: K,
          listener: (...args: SdkEventMap[K]) => void,
        ) {
          const projectedListener = (event === 'error'
            ? ((error: unknown) => (listener as (error: Error) => void)(categorizeSdkError(error)))
            : listener) as (...args: any[]) => void
          client.on(event, projectedListener)
          let active = true
          return () => {
            if (!active) return
            active = false
            client.off(event, projectedListener)
          }
        },
        async reply(context, streamId, content, finish) {
          await client.replyStream(context as WsFrameHeaders, streamId, content, finish)
        },
        async download(url, aesKey) {
          const result = await client.downloadFile(url, aesKey)
          return { buffer: new Uint8Array(result.buffer), filename: result.filename }
        },
      }
    },
  }
}

export type QrAuthErrorCode = 'cancelled' | 'expired' | 'upstream' | 'invalid-response'

export class QrAuthError extends Error {
  constructor(readonly code: QrAuthErrorCode) {
    super(`WeCom QR authorization: ${code}`)
    this.name = 'QrAuthError'
  }
}

export interface QrAuthManager {
  connect(options: {
    readonly signal: AbortSignal
    readonly onQr: (dataUrl: string) => void
  }): Promise<{ readonly botId: string; readonly secret: string }>
  cancel(): void
}

export interface QrAuthManagerOptions {
  readonly fetch?: (url: URL, init: RequestInit) => Promise<Response>
  readonly toQrDataUrl: (value: string) => Promise<string>
  readonly generateUrl?: string
  readonly queryUrl?: string
  readonly pollIntervalMs?: number
  readonly ttlMs?: number
  readonly requestTimeoutMs?: number
  readonly maxResponseBytes?: number
  readonly now?: () => number
}

export function createQrAuthManager(options: QrAuthManagerOptions): QrAuthManager {
  const fetcher = options.fetch ?? ((url, init) => fetch(url, init))
  const now = options.now ?? Date.now
  const pollIntervalMs = options.pollIntervalMs ?? 3000
  const ttlMs = options.ttlMs ?? 5 * 60_000
  const requestTimeoutMs = options.requestTimeoutMs ?? 10_000
  const maxResponseBytes = options.maxResponseBytes ?? 64 * 1024
  let active: AbortController | undefined

  async function request(url: URL, signal: AbortSignal): Promise<Record<string, any>> {
    const timeout = AbortSignal.timeout(requestTimeoutMs)
    const response = await fetcher(url, { method: 'GET', signal: AbortSignal.any([signal, timeout]) })
      .catch(() => { throw signal.aborted ? new QrAuthError('cancelled') : new QrAuthError('upstream') })
    if (!response.ok) throw new QrAuthError('upstream')
    if (!response.body) throw new QrAuthError('invalid-response')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let bytes = 0
    try {
      while (true) {
        const item = await reader.read()
        if (item.done) break
        bytes += item.value.byteLength
        if (bytes > maxResponseBytes) throw new QrAuthError('invalid-response')
        chunks.push(item.value)
      }
    } finally {
      reader.releaseLock()
    }
    const merged = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength }
    try {
      const value = JSON.parse(new TextDecoder().decode(merged))
      if (typeof value !== 'object' || value === null) throw new Error()
      return value
    } catch {
      throw new QrAuthError('invalid-response')
    }
  }

  return {
    async connect({ signal, onQr }) {
      active?.abort()
      const generation = new AbortController()
      active = generation
      const combined = AbortSignal.any([signal, generation.signal])
      const startedAt = now()
      try {
        const generate = new URL(options.generateUrl ?? 'https://work.weixin.qq.com/ai/qc/generate')
        generate.searchParams.set('source', 'dsh-wecom')
        generate.searchParams.set('plat', '0')
        const generated = await request(generate, combined)
        const scode = stringAt(generated, ['data', 'scode'])
        const authUrl = stringAt(generated, ['data', 'auth_url'])
        if (!scode || !authUrl) throw new QrAuthError('invalid-response')
        onQr(await options.toQrDataUrl(authUrl))

        while (true) {
          if (combined.aborted) throw new QrAuthError('cancelled')
          if (now() - startedAt >= ttlMs) throw new QrAuthError('expired')
          await delay(pollIntervalMs, combined)
          const query = new URL(options.queryUrl ?? 'https://work.weixin.qq.com/ai/qc/query_result')
          query.searchParams.set('scode', scode)
          const result = await request(query, combined)
          const status = stringAt(result, ['data', 'status'])?.toLowerCase()
          if (['expired', 'expire', 'timeout', 'cancel', 'canceled', 'cancelled', 'invalid'].includes(status ?? '')) {
            throw new QrAuthError('expired')
          }
          if (status !== 'success') continue
          const botId = stringAt(result, ['data', 'bot_info', 'botid'])
          const secret = stringAt(result, ['data', 'bot_info', 'secret'])
          if (!botId || !secret) throw new QrAuthError('invalid-response')
          return { botId, secret }
        }
      } catch (error) {
        if (combined.aborted && !(error instanceof QrAuthError)) throw new QrAuthError('cancelled')
        throw error
      } finally {
        if (active === generation) active = undefined
      }
    },
    cancel() { active?.abort() },
  }
}

function stringAt(value: Record<string, any>, path: readonly string[]): string | undefined {
  let current: any = value
  for (const part of path) current = current?.[part]
  return typeof current === 'string' && current.trim() !== '' ? current : undefined
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new QrAuthError('cancelled'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(finish, ms)
    function finish() { cleanup(); resolve() }
    function abort() { cleanup(); reject(new QrAuthError('cancelled')) }
    function cleanup() { clearTimeout(timer); signal.removeEventListener('abort', abort) }
    signal.addEventListener('abort', abort, { once: true })
  })
}

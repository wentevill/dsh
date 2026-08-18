import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {
  MailListRequest,
  MailListResult,
  MailProvider,
  MailReadRequest,
  MailReadResult,
  MailSendRequest,
  MailSendResult,
} from './types.ts'
import { MailError } from './types.ts'

export { MailError } from './types.ts'
export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    mail: MailRuntime
  }
}

export interface MailRuntimeConfig {
  readonly provider?: string
}

export class MailRuntime extends Service {
  static Config: z<MailRuntimeConfig> = z.object({ provider: z.string() })
  private readonly providers = new Map<string, MailProvider>()

  constructor(ctx: Context, private readonly config: MailRuntimeConfig = {}) {
    super(ctx, 'mail')
  }

  registerProvider(provider: MailProvider): () => void {
    if (this.providers.has(provider.id)) {
      throw new MailError(`a mail provider with id "${provider.id}" is already registered`, 'MAIL_DUPLICATE_PROVIDER')
    }
    const providers = this.providers
    const dispose = this.ctx.effect(function* () {
      providers.set(provider.id, provider)
      yield () => providers.delete(provider.id)
    }, 'mail.registerProvider()')
    return () => void dispose()
  }

  async list(request: MailListRequest, signal?: AbortSignal): Promise<MailListResult> {
    const result = await this.call(provider => provider.list(request, signal))
    if (result.messages.length <= request.limit) return result
    return { ...result, messages: result.messages.slice(0, request.limit), truncated: true }
  }

  read(request: MailReadRequest, signal?: AbortSignal): Promise<MailReadResult> {
    return this.call(provider => provider.read(request, signal))
  }

  send(request: MailSendRequest, signal?: AbortSignal): Promise<MailSendResult> {
    return this.call(provider => provider.send(request, signal))
  }

  private async call<T>(operation: (provider: MailProvider) => Promise<T>): Promise<T> {
    const provider = this.resolveProvider()
    try {
      return await operation(provider)
    } catch (error) {
      if (error instanceof MailError) throw error
      throw MailError.providerFailure(error)
    }
  }

  private resolveProvider(): MailProvider {
    if (this.config.provider !== undefined) {
      const provider = this.providers.get(this.config.provider)
      if (!provider) throw new MailError('configured mail provider is not registered', 'MAIL_PROVIDER_CONFIGURED_MISSING')
      if (!provider.available()) throw new MailError('configured mail provider is unavailable', 'MAIL_PROVIDER_CONFIGURED_UNAVAILABLE')
      return provider
    }
    const usable = [...this.providers.values()].filter(provider => provider.available())
    if (usable.length === 0) throw new MailError('no usable mail provider is registered', 'MAIL_PROVIDER_UNAVAILABLE')
    if (usable.length > 1) throw new MailError('multiple usable mail providers are registered', 'MAIL_PROVIDER_AMBIGUOUS')
    const provider = usable[0]
    if (provider === undefined) throw new MailError('no usable mail provider is registered', 'MAIL_PROVIDER_UNAVAILABLE')
    return provider
  }
}

export default MailRuntime

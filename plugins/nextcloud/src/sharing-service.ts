import { createPathPolicy, type PathPolicySettings } from './path-policy.ts'
import { SHARE_PERMISSIONS, type CreateShareInput, type NextcloudShare, type NextcloudSharee, type ShareProfile, type UpdateShareInput } from './sharing-types.ts'

const MAX_RESULTS = 100

export interface SharingTransportPort {
  listShares(path?: string, signal?: AbortSignal): Promise<NextcloudShare[]>
  getShare(id: number, signal?: AbortSignal): Promise<NextcloudShare>
  searchSharees(query: string, limit: number, signal?: AbortSignal): Promise<NextcloudSharee[]>
  createShare(input: CreateShareInput, signal?: AbortSignal): Promise<NextcloudShare>
  updateShare(id: number, input: UpdateShareInput, signal?: AbortSignal): Promise<NextcloudShare>
  deleteShare(id: number, signal?: AbortSignal): Promise<void>
}

interface FileMetadataPort { stat(path: string, signal?: AbortSignal): Promise<{ type: 'file' | 'directory'; etag?: string | null }> }

export interface ShareCreateRequest extends CreateShareInput {}
export interface ShareUpdateRequest {
  readonly profile?: ShareProfile
  readonly password?: string
  readonly expireDate?: string
  readonly note?: string
}

function resultLimit(value?: number): number {
  const limit = value ?? MAX_RESULTS
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RESULTS) throw new Error(`limit must be between 1 and ${MAX_RESULTS}`)
  return limit
}

function shareId(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('shareId must be a positive integer')
  return value
}

function validDate(value: string | undefined): void {
  if (value === undefined) return
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  if (match === null) throw new Error('invalid share expiration date')
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('invalid share expiration date')
}

function cleanOptional(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined
  const clean = value.trim()
  if (clean === '') throw new Error(`${label} must not be empty`)
  return clean
}

function redactShare(value: NextcloudShare): NextcloudShare {
  const { password: _password, share_password: _sharePassword, ...safe } = value as NextcloudShare & { password?: unknown; share_password?: unknown }
  return safe
}

export class NextcloudSharingService {
  private readonly policy
  private readonly accessMode

  constructor(private readonly transport: SharingTransportPort, private readonly files: FileMetadataPort, settings: PathPolicySettings) {
    this.policy = createPathPolicy(settings)
    this.accessMode = settings.accessMode
  }

  async list(input: { path?: string; limit?: number } = {}, signal?: AbortSignal) {
    const limit = resultLimit(input.limit)
    const paths = input.path !== undefined ? [this.policy.assertAllowed(input.path)] : this.accessMode === 'allowlist' ? [...this.policy.roots] : [undefined]
    const shares = (await Promise.all(paths.map(path => this.transport.listShares(path, signal)))).flat()
    const unique = [...new Map(shares.map(item => [item.id, redactShare(item)])).values()]
    return { shares: unique.slice(0, limit), truncated: unique.length > limit }
  }

  async get(id: number, signal?: AbortSignal): Promise<NextcloudShare> {
    const item = await this.transport.getShare(shareId(id), signal)
    this.policy.assertAllowed(item.path)
    return redactShare(item)
  }

  async searchSharees(query: string, limitInput?: number, type: 'all' | 'user' | 'group' = 'all', signal?: AbortSignal) {
    const clean = query.trim()
    if (clean === '') throw new Error('sharee search query is required')
    if (!(['all', 'user', 'group'] as const).includes(type)) throw new Error('invalid sharee type')
    const limit = resultLimit(limitInput)
    const entries = await this.transport.searchSharees(clean, limit + 1, signal)
    const filtered = type === 'all' ? entries : entries.filter(entry => entry.type === type)
    return { sharees: filtered.slice(0, limit), truncated: filtered.length > limit }
  }

  async validateCreate(input: ShareCreateRequest, signal?: AbortSignal): Promise<ShareCreateRequest> {
    const path = this.policy.assertAllowed(input.path)
    if (!(['publicLink', 'user', 'group'] as const).includes(input.target)) throw new Error('invalid share target')
    if (!(['read', 'edit', 'fileDrop'] as const).includes(input.profile)) throw new Error('invalid share profile')
    const recipient = cleanOptional(input.recipient, 'share recipient')
    if (input.target === 'publicLink' && recipient !== undefined) throw new Error('public link must not specify a recipient')
    if (input.target !== 'publicLink' && recipient === undefined) throw new Error('user and group shares require a recipient')
    if (input.profile === 'fileDrop') {
      if (input.target !== 'publicLink') throw new Error('File Drop requires a public link')
      if ((await this.files.stat(path, signal)).type !== 'directory') throw new Error('File Drop requires a directory')
    }
    if (input.target !== 'publicLink' && (input.password !== undefined || input.expireDate !== undefined || input.label !== undefined)) throw new Error('public link options require a public link')
    validDate(input.expireDate)
    return {
      ...input, path,
      ...(recipient === undefined ? {} : { recipient }),
      ...(cleanOptional(input.password, 'share password') === undefined ? {} : { password: cleanOptional(input.password, 'share password') }),
      ...(cleanOptional(input.note, 'share note') === undefined ? {} : { note: cleanOptional(input.note, 'share note') }),
      ...(cleanOptional(input.label, 'share label') === undefined ? {} : { label: cleanOptional(input.label, 'share label') }),
    }
  }

  async create(input: ShareCreateRequest, signal?: AbortSignal): Promise<NextcloudShare> {
    return redactShare(await this.transport.createShare(await this.validateCreate(input, signal), signal))
  }

  async validateUpdate(id: number, input: ShareUpdateRequest, signal?: AbortSignal): Promise<{ current: NextcloudShare; update: UpdateShareInput }> {
    const current = await this.get(id, signal)
    if (input.profile !== undefined && !(['read', 'edit', 'fileDrop'] as const).includes(input.profile)) throw new Error('invalid share profile')
    if (input.profile === undefined && input.password === undefined && input.expireDate === undefined && input.note === undefined) throw new Error('at least one share update is required')
    if (current.target !== 'publicLink' && (input.password !== undefined || input.expireDate !== undefined)) throw new Error('public link options require a public link')
    if (input.profile === 'fileDrop') {
      if (current.target !== 'publicLink') throw new Error('File Drop requires a public link')
      if ((await this.files.stat(current.path, signal)).type !== 'directory') throw new Error('File Drop requires a directory')
    }
    validDate(input.expireDate)
    return { current, update: {
      ...(input.profile === undefined ? {} : { permissions: SHARE_PERMISSIONS[input.profile], publicUpload: input.profile === 'fileDrop' }),
      ...(cleanOptional(input.password, 'share password') === undefined ? {} : { password: cleanOptional(input.password, 'share password') }),
      ...(input.expireDate === undefined ? {} : { expireDate: input.expireDate }),
      ...(cleanOptional(input.note, 'share note') === undefined ? {} : { note: cleanOptional(input.note, 'share note') }),
    } }
  }

  async update(id: number, input: ShareUpdateRequest, signal?: AbortSignal): Promise<NextcloudShare> {
    const validated = await this.validateUpdate(id, input, signal)
    return redactShare(await this.transport.updateShare(id, validated.update, signal))
  }

  async delete(id: number, signal?: AbortSignal): Promise<void> {
    await this.get(id, signal)
    await this.transport.deleteShare(id, signal)
  }
}

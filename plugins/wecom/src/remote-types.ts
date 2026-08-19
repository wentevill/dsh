import type { WeComChannelSnapshot } from './channel-types.js'

/** Non-secret authorization state projected to Plugin configuration. */
type WeComApiAuthSnapshot =
  | { readonly state: 'unauthorized' }
  | { readonly state: 'generating_qr' }
  | { readonly state: 'awaiting_scan'; readonly qrDataUrl: string }
  | { readonly state: 'authorized'; readonly botId?: string }
  | { readonly state: 'refreshing_schema'; readonly botId?: string }
  | { readonly state: 'ready'; readonly botId?: string; readonly toolCount: number }
  | { readonly state: 'sync_failed'; readonly botId?: string; readonly message: string }
  | { readonly state: 'deleting'; readonly botId?: string }

export type WeComAuthSnapshot = WeComApiAuthSnapshot & {
  readonly channel?: WeComChannelSnapshot
}

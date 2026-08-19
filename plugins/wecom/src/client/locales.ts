export const en = {
  title: 'WeCom AI',
  description: 'Connect WeCom AI capabilities and automatically register authorized API tools.',
  authorize: 'Authorize WeCom', cancel: 'Cancel', refresh: 'Refresh APIs', remove: 'Remove authorization',
  unauthorized: 'Not authorized', generating_qr: 'Generating QR code…', awaiting_scan: 'Scan with WeCom to authorize',
  authorized: 'Authorized', refreshing_schema: 'Synchronizing APIs…', ready: 'Ready', deleting: 'Removing authorization…', sync_failed: 'Synchronization failed',
  qrAlt: 'WeCom authorization QR code', deleteConfirm: 'Remove WeCom authorization? Its API tools will be removed immediately.',
  remoteFailed: 'The authorization request failed.', toolCount: '{count} APIs', botId: 'Bot {id}',
}

export const zh = {
  title: '企业微信 AI',
  description: '连接企业微信 AI 开放能力，授权后自动发现并注册 API 工具。',
  authorize: '授权企业微信', cancel: '取消', refresh: '刷新 API', remove: '删除授权',
  unauthorized: '未授权', generating_qr: '正在生成二维码…', awaiting_scan: '请使用企业微信扫码授权',
  authorized: '已授权', refreshing_schema: '正在同步 API…', ready: '已就绪', deleting: '正在删除授权…', sync_failed: '同步失败',
  qrAlt: '企业微信授权二维码', deleteConfirm: '确定删除企业微信授权？删除后相关 API 工具会立即移除。',
  remoteFailed: '授权请求失败。', toolCount: '{count} 个 API', botId: '机器人 {id}',
}

export type WeComLocaleKey = keyof typeof en

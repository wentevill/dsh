import type {} from '@deepseek-ai/dsh-client-locale/client'

export const zh = {
  manager: 'Cron 管理器', collapse: '收起', manage: '管理 Cron', loading: '正在准备 Cron 管理器…',
  unavailable: 'Cron 管理器暂不可用', loadFailed: '暂时无法加载 Cron', related: '相关', all: '全部',
  deleted: '已删除', createCron: '新建 Cron', name: '名称', expression: 'Cron 表达式', prompt: '任务内容',
  timezone: '时区', mode: '执行模式', existingSession: '当前 Session', newSession: '每次新建 Session',
  create: '创建', cancel: '取消', pause: '暂停', resume: '恢复', edit: '编辑', save: '保存', remove: '删除',
  readonly: '只读', moreHistory: '更多历史', openSession: '打开执行 Session', noItems: '暂无 Cron',
} as const

export const en: Record<keyof typeof zh, string> = {
  manager: 'Cron manager', collapse: 'Collapse', manage: 'Manage Cron', loading: 'Preparing Cron manager…',
  unavailable: 'Cron manager unavailable', loadFailed: 'Unable to load Cron', related: 'Related', all: 'All',
  deleted: 'Deleted', createCron: 'New Cron', name: 'Name', expression: 'Cron expression', prompt: 'Task prompt',
  timezone: 'Timezone', mode: 'Execution mode', existingSession: 'Current Session', newSession: 'New Session each run',
  create: 'Create', cancel: 'Cancel', pause: 'Pause', resume: 'Resume', edit: 'Edit', save: 'Save', remove: 'Delete',
  readonly: 'Read only', moreHistory: 'More history', openSession: 'Open execution Session', noItems: 'No Cron tasks',
}

export type CronLocaleKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    cron: CronLocaleKey
  }
}

export const zhTranslate = (key: CronLocaleKey): string => zh[key]

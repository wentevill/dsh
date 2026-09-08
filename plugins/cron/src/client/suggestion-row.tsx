import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import React, { useRef, useState } from 'react'
import { CronManagerController, type CronRemotePort } from './controller.ts'
import { CronManager, type CronSessionsPort } from './manager.tsx'
import { type CronLocaleKey, zhTranslate } from './locales.ts'
import { css, ensureCronStyles } from './styles.ts'

interface Suggestion {
  readonly kind: 'cron-manager-suggestion'
  readonly scope: 'related'
  readonly sessionId: SessionId
}

export type CronManagerToolRowProps = Pick<ToolCallViewProps, 'callId' | 'toolName' | 'block'> & {
  readonly sessionId: SessionId
  readonly remote: CronRemotePort
  readonly sessions: CronSessionsPort
  readonly t?: (key: CronLocaleKey) => string
}

/** Claimed keyed Tool row for the settled cron_open_manager suggestion. */
export function CronManagerToolRow(props: CronManagerToolRowProps) {
  ensureCronStyles()
  const t = props.t ?? zhTranslate
  const [expanded, setExpanded] = useState(false)
  const controller = useRef<CronManagerController | undefined>(undefined)
  const suggestion = parseSuggestion(props.block, props.sessionId)

  if (!('kind' in props.block)) {
    return <div className={css.compact} role="status">{t('loading')}</div>
  }
  if (suggestion === undefined) {
    return <div className={css.compact} role="status">{t('unavailable')}</div>
  }
  controller.current ??= new CronManagerController(props.sessionId, props.remote, suggestion.scope)
  if (!expanded) {
    return <div className={css.compact}>
      <button type="button" onClick={() => setExpanded(true)}>{t('manage')}</button>
    </div>
  }
  return <CronManager
    sessionId={props.sessionId} initial={{ scope: suggestion.scope }} remote={props.remote}
    sessions={props.sessions} controller={controller.current} t={t}
    onCollapse={() => setExpanded(false)}
  />
}

function parseSuggestion(block: ToolCallViewProps['block'], sessionId: SessionId): Suggestion | undefined {
  if (!('kind' in block) || block.kind !== 'tool-result' || block.isError || block.call?.name !== 'cron_open_manager') {
    return undefined
  }
  const text = block.content.find(value => value.type === 'text')
  if (text === undefined || typeof text.text !== 'string' || text.text.length > 2_000) return undefined
  try {
    const value = JSON.parse(text.text) as Record<string, unknown>
    if (
      Object.keys(value).length !== 3
      || value['kind'] !== 'cron-manager-suggestion'
      || value['scope'] !== 'related'
      || value['sessionId'] !== sessionId
    ) return undefined
    return value as unknown as Suggestion
  } catch {
    return undefined
  }
}

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CronListScope } from '../commands.ts'
import type { CronDefinitionWire } from '../remote-types.ts'
import { CronManagerController, type CronRemotePort } from './controller.ts'
import { type CronLocaleKey, zhTranslate } from './locales.ts'
import { css, ensureCronStyles } from './styles.ts'

export interface CronSessionsPort { open(sessionId: SessionId): void }

export interface CronManagerProps {
  readonly sessionId: SessionId
  readonly initial: { readonly scope: CronListScope }
  readonly remote: CronRemotePort
  readonly sessions: CronSessionsPort
  readonly controller?: CronManagerController
  readonly t?: (key: CronLocaleKey) => string
  readonly onCollapse?: () => void
}

export function CronManager(props: CronManagerProps) {
  ensureCronStyles()
  const owned = useRef<CronManagerController | undefined>(undefined)
  owned.current ??= new CronManagerController(props.sessionId, props.remote, props.initial.scope)
  const controller = props.controller ?? owned.current
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const t = props.t ?? zhTranslate
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)
  const selected = snapshot.items.find(item => item.id === snapshot.selectedCronId)

  useEffect(() => { void controller.initialize() }, [controller])

  return <section className={css.shell} role="region" aria-label={t('manager')}>
    <div className={css.toolbar}>
      {(['related', 'all', 'deleted'] as const).map(scope =>
        <button key={scope} type="button" disabled={snapshot.busy || snapshot.scope === scope}
          onClick={() => void controller.load(scope)}>{t(scope)}</button>)}
      <button type="button" onClick={() => setCreating(true)}>{t('createCron')}</button>
      {props.onCollapse && <button type="button" onClick={props.onCollapse}>{t('collapse')}</button>}
    </div>
    {snapshot.error && <p className={css.notice} role="status">{t('loadFailed')}</p>}
    {creating && <DefinitionForm t={t} submitLabel={t('create')} onCancel={() => setCreating(false)}
      onSubmit={async value => { await controller.create(value); setCreating(false) }} />}
    <div className={css.body}>
      <ul className={css.list}>
        {snapshot.items.map(item => <li key={item.id}><button type="button"
          aria-pressed={item.id === snapshot.selectedCronId}
          onClick={() => void controller.select(item.id)}>{item.name}</button></li>)}
        {!snapshot.busy && snapshot.items.length === 0 && <li className={css.notice}>{t('noItems')}</li>}
      </ul>
      {selected && <div className={css.details}>
        <strong>{selected.name}</strong>
        <code>{selected.expression}</code>
        <span>{selected.timezone}</span>
        <span>{selected.executionMode === 'existing_session' ? t('existingSession') : t('newSession')}</span>
        <p>{selected.prompt}</p>
        {selected.state === 'deleted'
          ? <span>{t('readonly')}</span>
          : <>
            <div className={css.actions}>
              {selected.state === 'active'
                ? <button type="button" disabled={snapshot.busy} onClick={() => void controller.pause(selected.id)}>{t('pause')}</button>
                : <button type="button" disabled={snapshot.busy} onClick={() => void controller.resume(selected.id)}>{t('resume')}</button>}
              <button type="button" disabled={snapshot.busy} onClick={() => setEditing(true)}>{t('edit')}</button>
              <button type="button" disabled={snapshot.busy} onClick={() => void controller.delete(selected.id)}>{t('remove')}</button>
            </div>
            {editing && <DefinitionForm t={t} initial={selected} submitLabel={t('save')}
              onCancel={() => setEditing(false)}
              onSubmit={async value => {
                await controller.update(selected.id, selected.revision, value)
                setEditing(false)
              }} />}
          </>}
        <ul className={css.history}>
          {snapshot.history.map(item => <li key={item.id}>
            <code>{item.id}</code> · {item.state}
            {item.sessionId && <button type="button" aria-label={t('openSession')}
              onClick={() => props.sessions.open(item.sessionId as SessionId)}>{t('openSession')}</button>}
          </li>)}
        </ul>
        {snapshot.historyCursor && <button type="button" onClick={() => void controller.loadHistory()}>{t('moreHistory')}</button>}
      </div>}
    </div>
  </section>
}

interface FormValue {
  readonly name: string
  readonly expression: string
  readonly timezone: string
  readonly prompt: string
  readonly executionMode: 'existing_session' | 'new_session'
}

function DefinitionForm(props: {
  readonly t: (key: CronLocaleKey) => string
  readonly initial?: CronDefinitionWire
  readonly submitLabel: string
  readonly onSubmit: (value: FormValue) => Promise<void>
  readonly onCancel: () => void
}) {
  const [name, setName] = useState(props.initial?.name ?? '')
  const [expression, setExpression] = useState(props.initial?.expression ?? '')
  const [timezone, setTimezone] = useState(props.initial?.timezone ?? browserTimezone())
  const [prompt, setPrompt] = useState(props.initial?.prompt ?? '')
  const [executionMode, setExecutionMode] = useState<FormValue['executionMode']>(props.initial?.executionMode ?? 'existing_session')
  return <form className={css.form} onSubmit={event => {
    event.preventDefault()
    void props.onSubmit({ name, expression, timezone, prompt, executionMode })
  }}>
    <label>{props.t('name')}<input aria-label={props.t('name')} value={name} onChange={event => setName(event.target.value)} required /></label>
    <label>{props.t('expression')}<input aria-label={props.t('expression')} value={expression} onChange={event => setExpression(event.target.value)} required /></label>
    <label>{props.t('timezone')}<input aria-label={props.t('timezone')} value={timezone} onChange={event => setTimezone(event.target.value)} required /></label>
    <label>{props.t('prompt')}<textarea aria-label={props.t('prompt')} value={prompt} onChange={event => setPrompt(event.target.value)} required /></label>
    <label>{props.t('mode')}<select aria-label={props.t('mode')} value={executionMode}
      onChange={event => setExecutionMode(event.target.value as FormValue['executionMode'])}>
      <option value="existing_session">{props.t('existingSession')}</option>
      <option value="new_session">{props.t('newSession')}</option>
    </select></label>
    <div className={css.actions}>
      <button type="submit">{props.submitLabel}</button>
      <button type="button" onClick={props.onCancel}>{props.t('cancel')}</button>
    </div>
  </form>
}

function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
}

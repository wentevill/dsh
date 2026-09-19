import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { Button, IconChevronDownOutline14, IconTrashOutline16, Input, Menu, Modal, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import React, { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react'
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
  const owned = useMemo(
    () => new CronManagerController(props.sessionId, props.remote, props.initial.scope),
    [props.initial.scope, props.remote, props.sessionId],
  )
  const controller = props.controller ?? owned
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const t = props.t ?? zhTranslate
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const editing = snapshot.items.find(item => item.id === editingId)
  const deleting = snapshot.items.find(item => item.id === deletingId)

  useEffect(() => { void controller.initialize() }, [controller])

  const openEditor = (item: CronDefinitionWire) => {
    setEditingId(item.id)
    if (snapshot.selectedCronId !== item.id) void controller.select(item.id)
  }

  return <section className={css.shell} role="region" aria-label={t('manager')}>
    <div className={css.toolbar}>
      <div className={css.toolbarActions}>
        <Button size="sm" variant="primary" onClick={() => setCreating(true)}>{t('createCron')}</Button>
        {props.onCollapse && <Button size="sm" variant="ghost" onClick={props.onCollapse}>{t('collapse')}</Button>}
      </div>
    </div>
    {snapshot.error && <p className={css.notice} role="status">{t('loadFailed')}</p>}
    <ul className={css.list}>
      {snapshot.items.map(item => <li key={item.id} className={css.row}>
        {item.state === 'deleted'
          ? <div className={css.rowMain}><code>{item.expression}</code><span>{item.name}</span></div>
          : <button type="button" className={css.rowOpen} aria-label={`${t('edit')} ${item.name}`}
              onClick={() => openEditor(item)}>
              <code>{item.expression}</code><span>{item.name}</span>
            </button>}
        <div className={css.rowActions}>
          {item.state === 'deleted'
            ? <span className={css.readonly}>{t('readonly')}</span>
            : <>
              <Switch checked={item.state === 'active'} disabled={snapshot.busy}
                label={`${t('enable')} ${item.name}`}
                onChange={enabled => void (enabled ? controller.resume(item.id) : controller.pause(item.id))} />
              <Button variant="outline" size="sm" className={css.danger}
                icon={<IconTrashOutline16 size={13} />} aria-label={`${t('remove')} ${item.name}`}
                disabled={snapshot.busy} onClick={() => setDeletingId(item.id)}>{t('remove')}</Button>
            </>}
        </div>
      </li>)}
      {!snapshot.busy && snapshot.items.length === 0 && <li className={css.notice}>{t('noItems')}</li>}
    </ul>

    {creating && <DefinitionDialog key="create" t={t} title={t('createCron')} submitLabel={t('create')}
      onCancel={() => setCreating(false)} onSubmit={async value => {
        await controller.create(value)
        setCreating(false)
      }} />}
    {editing && <DefinitionDialog key={editing.id} t={t} title={`${t('editTitle')}「${editing.name}」`}
      initial={editing} submitLabel={t('save')} onCancel={() => setEditingId(null)}
      onSubmit={async value => {
        await controller.update(editing.id, editing.revision, value)
        setEditingId(null)
      }}>
      <ExecutionHistory snapshot={snapshot} controller={controller} sessions={props.sessions} t={t} />
    </DefinitionDialog>}
    {deleting && <Modal open onClose={() => setDeletingId(null)}
      title={`${t('confirmDeleteTitle')}「${deleting.name}」？`} closeLabel={t('close')}
      description={t('confirmDeleteDescription')}
      footer={<>
        <Button variant="outline" onClick={() => setDeletingId(null)}>{t('cancel')}</Button>
        <Button variant="primary" className={css.dangerButton} onClick={() => {
          setDeletingId(null)
          void controller.delete(deleting.id)
        }}>{t('remove')}</Button>
      </>} />}
  </section>
}

function ExecutionHistory(props: {
  readonly snapshot: ReturnType<CronManagerController['getSnapshot']>
  readonly controller: CronManagerController
  readonly sessions: CronSessionsPort
  readonly t: (key: CronLocaleKey) => string
}) {
  return <div className={css.historySection}>
    <ul className={css.history}>
      {props.snapshot.history.map(item => <li key={item.id}>
        <code>{item.id}</code> · {item.state}
        {item.sessionId && <Button size="sm" variant="ghost" aria-label={props.t('openSession')}
          onClick={() => props.sessions.open(item.sessionId as SessionId)}>{props.t('openSession')}</Button>}
      </li>)}
    </ul>
    {props.snapshot.historyCursor && <Button size="sm" variant="ghost"
      onClick={() => void props.controller.loadHistory()}>{props.t('moreHistory')}</Button>}
  </div>
}

interface FormValue {
  readonly name: string
  readonly expression: string
  readonly timezone: string
  readonly prompt: string
  readonly executionMode: 'existing_session' | 'new_session'
}

function DefinitionDialog(props: {
  readonly t: (key: CronLocaleKey) => string
  readonly title: string
  readonly initial?: CronDefinitionWire
  readonly submitLabel: string
  readonly onSubmit: (value: FormValue) => Promise<void>
  readonly onCancel: () => void
  readonly children?: React.ReactNode
}) {
  const formId = useId()
  const [name, setName] = useState(props.initial?.name ?? '')
  const [expression, setExpression] = useState(props.initial?.expression ?? '')
  const [timezone, setTimezone] = useState(props.initial?.timezone ?? browserTimezone())
  const [prompt, setPrompt] = useState(props.initial?.prompt ?? '')
  const [executionMode, setExecutionMode] = useState<FormValue['executionMode']>(props.initial?.executionMode ?? 'existing_session')
  const [submitting, setSubmitting] = useState(false)
  return <Modal open onClose={props.onCancel} title={props.title} closeLabel={props.t('close')}
    className={css.dialog}
    contentClassName={css.dialogContent}
    footer={<>
      <Button variant="outline" disabled={submitting} onClick={props.onCancel}>{props.t('cancel')}</Button>
      <Button variant="primary" disabled={submitting} type="submit" form={formId}>{props.submitLabel}</Button>
    </>}>
    <form id={formId} className={css.form} onSubmit={event => {
      event.preventDefault()
      setSubmitting(true)
      void props.onSubmit({ name, expression, timezone, prompt, executionMode }).finally(() => setSubmitting(false))
    }}>
      <label>{props.t('name')}<Input aria-label={props.t('name')} value={name}
        onChange={event => setName(event.target.value)} required /></label>
      <label>{props.t('expression')}<Input aria-label={props.t('expression')} value={expression}
        onChange={event => setExpression(event.target.value)} required /></label>
      <label>{props.t('timezone')}<Input aria-label={props.t('timezone')} value={timezone}
        onChange={event => setTimezone(event.target.value)} required /></label>
      <label>{props.t('prompt')}<textarea aria-label={props.t('prompt')} value={prompt}
        onChange={event => setPrompt(event.target.value)} required /></label>
      <label>{props.t('mode')}<ExecutionModeMenu value={executionMode} onChange={setExecutionMode} t={props.t} /></label>
    </form>
    {props.children}
  </Modal>
}

function ExecutionModeMenu(props: {
  readonly value: FormValue['executionMode']
  readonly onChange: (value: FormValue['executionMode']) => void
  readonly t: (key: CronLocaleKey) => string
}) {
  const [open, setOpen] = useState(false)
  const labels: Record<FormValue['executionMode'], string> = {
    existing_session: props.t('existingSession'),
    new_session: props.t('newSession'),
  }
  return <Menu open={open} selectedId={props.value} portal
    items={Object.entries(labels).map(([id, label]) => ({ id, label }))}
    onClose={() => setOpen(false)} onSelect={id => {
      props.onChange(id as FormValue['executionMode'])
      setOpen(false)
    }}
    anchor={<Button type="button" variant="outline" className={css.modeButton}
      aria-label={props.t('mode')} aria-haspopup="menu" aria-expanded={open}
      onClick={() => setOpen(value => !value)}>
      <span>{labels[props.value]}</span><IconChevronDownOutline14 size={14} />
    </Button>} />
}

function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
}

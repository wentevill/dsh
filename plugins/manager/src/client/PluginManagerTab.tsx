import { useEffect, useId, useState, type DragEvent, type ReactNode } from 'react'
import type { InstallResult, ListPluginsResult, UninstallResult } from '../remote-types.ts'
import type { ManagedPluginEntry } from '../profile.ts'
import type { PluginManagerLocaleKey } from './locales.ts'

const MAX_FILE_BYTES = 100 * 1024 * 1024

const ERROR_MESSAGE_KEYS: Readonly<Record<string, PluginManagerLocaleKey>> = {
  'the plugin manager is updated with Desktop': 'managerProtectedError',
  'the plugin manager cannot uninstall itself': 'managerProtectedError',
  'plugin downgrades are not supported': 'downgradeBlocked',
  'another plugin operation is active': 'anotherOperationActive',
  'plugin is not an uninstallable profile dependency': 'pluginNotFoundError',
  'plugin version changed; refresh and try again': 'pluginStateChanged',
  'upload is incomplete': 'uploadIncomplete',
  'select one supported .tgz package': 'invalidFileError',
}

function describeOperationError(t: (key: PluginManagerLocaleKey) => string, error: unknown): string {
  const message = error instanceof Error ? error.message : ''
  const key = ERROR_MESSAGE_KEYS[message]
  return key !== undefined ? t(key) : message !== '' ? message : t('operationError')
}

export interface PluginManagerTabProps {
  readonly t: (key: PluginManagerLocaleKey) => string
  readonly list: () => Promise<ListPluginsResult>
  readonly install: (file: File, onProgress?: (received: number, size: number) => void) => Promise<InstallResult>
  readonly uninstall: (entry: ManagedPluginEntry) => Promise<UninstallResult>
  /** Restart the application so an installed plugin takes effect. Defaults to reloading the page. */
  readonly restart?: () => void
}

export function PluginManagerTab({ t, list, install, uninstall, restart = () => window.location.reload() }: PluginManagerTabProps): ReactNode {
  const inputId = useId()
  const [entries, setEntries] = useState<readonly ManagedPluginEntry[]>([])
  const [expanded, setExpanded] = useState<string>()
  const [confirming, setConfirming] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [fileName, setFileName] = useState<string>()
  const [progress, setProgress] = useState<number>(0)
  const [installPrompt, setInstallPrompt] = useState(false)

  const refresh = async (): Promise<void> => {
    const result = await list()
    setEntries(result.entries)
  }

  useEffect(() => {
    let current = true
    void list().then(
      result => { if (current) setEntries(result.entries) },
      () => { if (current) setError(t('operationError')) },
    ).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [list, t])

  const selectFile = async (files: FileList | readonly File[]): Promise<void> => {
    setError(undefined)
    setMessage(undefined)
    setInstallPrompt(false)
    if (files.length !== 1) {
      setError(t('singleFileError'))
      return
    }
    const file = files[0]
    if (file === undefined || !file.name.toLowerCase().endsWith('.tgz') || file.size <= 0 || file.size > MAX_FILE_BYTES) {
      setError(t('invalidFileError'))
      return
    }
    setBusy(true)
    setFileName(file.name)
    setProgress(0)
    try {
      await install(file, (received, size) => {
        setProgress(size > 0 ? received / size : 0)
      })
      await refresh()
      setBusy(false)
      setProgress(0)
      setConfirming(undefined)
      setInstallPrompt(true)
    } catch (error) {
      setError(describeOperationError(t, error))
    } finally {
      setBusy(false)
      setProgress(0)
    }
  }

  useEffect(() => {
    const hasFiles = (event: globalThis.DragEvent): boolean =>
      (event.dataTransfer?.files.length ?? 0) > 0
      || (event.dataTransfer?.types.includes('Files') ?? false)
    const claim = (event: globalThis.DragEvent): boolean => {
      if (!hasFiles(event)) return false
      event.preventDefault()
      event.stopImmediatePropagation()
      return true
    }
    const onDragEnter = (event: globalThis.DragEvent): void => {
      if (claim(event)) setDragActive(true)
    }
    const onDragOver = (event: globalThis.DragEvent): void => {
      if (!claim(event) || event.dataTransfer === null) return
      event.dataTransfer.dropEffect = busy ? 'none' : 'copy'
    }
    const onDragLeave = (event: globalThis.DragEvent): void => {
      if (claim(event)) setDragActive(false)
    }
    const onDocumentDrop = (event: globalThis.DragEvent): void => {
      if (!claim(event)) return
      setDragActive(false)
      if (!busy && event.dataTransfer !== null) void selectFile(event.dataTransfer.files)
    }
    window.addEventListener('dragenter', onDragEnter, true)
    window.addEventListener('dragover', onDragOver, true)
    window.addEventListener('dragleave', onDragLeave, true)
    window.addEventListener('drop', onDocumentDrop, true)
    return () => {
      window.removeEventListener('dragenter', onDragEnter, true)
      window.removeEventListener('dragover', onDragOver, true)
      window.removeEventListener('dragleave', onDragLeave, true)
      window.removeEventListener('drop', onDocumentDrop, true)
    }
  }, [busy, selectFile])

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    if (!busy) void selectFile(event.dataTransfer.files)
  }

  const remove = async (entry: ManagedPluginEntry): Promise<void> => {
    if (!entry.canUninstall) return
    setBusy(true)
    setError(undefined)
    setMessage(undefined)
    try {
      await uninstall(entry)
      await refresh()
      setExpanded(undefined)
      setConfirming(undefined)
      setMessage(t('restartRequired'))
    } catch (error) {
      setError(describeOperationError(t, error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dsh-plugin-manager" aria-busy={busy || loading}>
      <div
        className="dsh-plugin-manager__drop"
        data-testid="plugin-drop-zone"
        data-drag-active={dragActive ? 'true' : undefined}
        onDragEnter={event => { event.preventDefault(); event.stopPropagation() }}
        onDragOver={event => { event.preventDefault(); event.stopPropagation() }}
        onDragLeave={event => { event.stopPropagation() }}
        onDrop={onDrop}
      >
        <strong>{t('dropTitle')}</strong>
        <span>{t('dropHint')}</span>
        <label className="dsh-plugin-manager__choose" htmlFor={inputId}>{t('choose')}</label>
        <input
          id={inputId}
          className="dsh-plugin-manager__input"
          type="file"
          accept=".tgz,application/gzip"
          aria-label={t('choose')}
          disabled={busy}
          onChange={event => {
            if (event.currentTarget.files) void selectFile(event.currentTarget.files)
            event.currentTarget.value = ''
          }}
        />
      </div>
      {busy && fileName ? (
        <div className="dsh-plugin-manager__importing" role="status">
          <span>{t('importing').replace('{name}', fileName)}</span>
          <progress className="dsh-plugin-manager__progress" value={progress} max={1}>{Math.round(progress * 100)}%</progress>
        </div>
      ) : busy ? <p role="status">{t('busy')}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {installPrompt ? (
        <div className="dsh-plugin-manager__dialog" role="dialog" aria-labelledby={`${inputId}-restart-title`}>
          <p id={`${inputId}-restart-title`}>{t('installComplete')}</p>
          <div className="dsh-plugin-manager__actions">
            <button type="button" onClick={() => {
              setInstallPrompt(false)
              setMessage(t('restartRequired'))
            }}>{t('restartLater')}</button>
            <button className="dsh-plugin-manager__restart" type="button" onClick={restart}>{t('restartNow')}</button>
          </div>
        </div>
      ) : null}
      <div className="dsh-plugin-manager__heading">
        <h3>{t('installed')}</h3>
        <span>{entries.length}</span>
      </div>
      {loading ? <p>{t('loading')}</p> : null}
      {!loading && entries.length === 0 ? <p>{t('empty')}</p> : null}
      <ul className="dsh-plugin-manager__cards">
        {entries.map(entry => {
          const open = expanded === entry.packageName
          const detailsId = `${inputId}-${encodeURIComponent(entry.packageName)}`
          return (
            <li className="dsh-plugin-manager__card" data-open={open ? 'true' : undefined} key={entry.packageName}>
              <button
                className="dsh-plugin-manager__card-head"
                type="button"
                aria-expanded={open}
                aria-controls={detailsId}
                aria-label={`${entry.packageName}, ${entry.version}`}
                onClick={() => {
                  setExpanded(value => value === entry.packageName ? undefined : entry.packageName)
                  setConfirming(undefined)
                }}
              >
                <strong title={entry.packageName}>{entry.packageName}</strong>
                <span className="dsh-plugin-manager__version">{entry.version}</span>
                <span className="dsh-plugin-manager__chevron" aria-hidden="true">⌄</span>
              </button>
              {open ? (
                <div className="dsh-plugin-manager__details" id={detailsId}>
                  <span>{confirming === entry.packageName
                    ? `${t('uninstallConfirm')} ${entry.packageName} ${entry.version}`
                    : entry.canUninstall ? t('removeHint') : t('managerProtected')}</span>
                  <div className="dsh-plugin-manager__actions">
                    {confirming === entry.packageName ? (
                      <>
                        <button type="button" disabled={busy} onClick={() => { setConfirming(undefined) }}>{t('cancel')}</button>
                        <button className="dsh-plugin-manager__uninstall" type="button" disabled={busy} onClick={() => { void remove(entry) }}>{t('confirmUninstall')}</button>
                      </>
                    ) : (
                      <button
                        className="dsh-plugin-manager__uninstall"
                        type="button"
                        disabled={busy || !entry.canUninstall}
                        onClick={() => { setConfirming(entry.packageName) }}
                      >{t('uninstall')}</button>
                    )}
                  </div>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

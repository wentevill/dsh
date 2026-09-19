/**
 * The form body rendered inside the official plugin manager's detail page.
 *
 * Vendored from the reference `ui-settings-plugins/src/client/PluginCard.tsx`
 * (same markup + behavior) but sourcing its class names from this bundle's own
 * prefixed stylesheet, so an external client needs none of the web shell's
 * content-hashed CSS-module names.
 */

import type { ReactNode } from 'react'
import { css, ensureCardCSS } from './card-css.ts'
import type { CardShell } from './card-types.ts'

/** Card chrome shared by every plugin section. */
export interface PluginCardProps {
  /** Locale reader for this section's copy. */
  t: (key: string) => string
  /** The card's form state: availability, writability, and what a save would do. */
  state: CardShell
  /** Write every staged edit. */
  onSave: () => void
  /** Drop every staged edit. */
  onDiscard: () => void
  /** The plugin's controls. */
  children: ReactNode
}

/** Render one plugin card. */
export function PluginCard(props: PluginCardProps) {
  ensureCardCSS()
  const { state } = props
  if (!state.available) return null
  const blocked = !state.dirty || state.invalid || state.saving
  return (
    <div className={css.body}>
      {!state.writable ? <p className={css.readOnly} role="status">{props.t('readOnly')}</p> : null}
      {props.children}
      <div className={css.footer}>
        {state.failed ? <p className={css.failed} role="status">{props.t('saveFailed')}</p> : null}
        <button type="button" className={css.discard} disabled={!state.dirty || state.saving} onClick={props.onDiscard}>
          {props.t('discard')}
        </button>
        <button type="button" className={css.save} disabled={blocked} onClick={props.onSave}>
          {props.t(state.saving ? 'saving' : 'save')}
        </button>
      </div>
    </div>
  )
}

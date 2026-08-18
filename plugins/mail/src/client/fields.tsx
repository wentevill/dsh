/**
 * Hand-written controls for the plugin configuration form (vendored from the
 * reference `ui-settings-plugins/src/client/fields.tsx`, class names sourced
 * from this bundle's own prefixed stylesheet).
 */

import { css, ensureCardCSS } from './card-css.ts'

/** What every field control needs regardless of its value type. */
export interface FieldProps {
  id: string
  label: string
  hint: string
  text: string
  overridden: boolean
  invalid: boolean
  overriddenLabel: string
  resetLabel: string
  invalidLabel: string
  disabled: boolean
  onEdit: (text: string) => void
  onReset: () => void
}

/** A staged value field; `numeric` hints a numeric keypad without narrowing input. */
export function ValueField(props: FieldProps & { numeric?: boolean; placeholder?: string }) {
  ensureCardCSS()
  return (
    <div className={css.field}>
      <div className={css.head}>
        <label className={css.label} htmlFor={props.id}>{props.label}</label>
        {props.overridden
          ? (
            <span className={css.badges}>
              <span className={css.badge}>{props.overriddenLabel}</span>
              <button
                type="button"
                className={css.reset}
                disabled={props.disabled}
                onClick={props.onReset}
              >
                {props.resetLabel}
              </button>
            </span>
          )
          : null}
      </div>
      <input
        id={props.id}
        className={props.invalid ? css.inputInvalid : css.input}
        type="text"
        {...props.numeric === true ? { inputMode: 'numeric' as const } : {}}
        {...props.invalid ? { 'aria-invalid': true } : {}}
        value={props.text}
        placeholder={props.placeholder ?? ''}
        disabled={props.disabled}
        onChange={(event) => { props.onEdit(event.target.value) }}
      />
      <p className={props.invalid ? css.invalid : css.hint}>
        {props.invalid ? props.invalidLabel : props.hint}
      </p>
    </div>
  )
}

/** A write-only credential control; the value never rides a response. */
export function SecretField(props: Pick<FieldProps, 'id' | 'label' | 'hint' | 'text' | 'disabled' | 'onEdit'> & {
  configured: boolean
  stateLabel: string
}) {
  ensureCardCSS()
  return (
    <div className={css.field}>
      <div className={css.head}>
        <label className={css.label} htmlFor={props.id}>{props.label}</label>
        <span className={css.badges}>
          <span className={props.configured ? css.badge : css.badgeMuted}>{props.stateLabel}</span>
        </span>
      </div>
      <input
        id={props.id}
        className={css.input}
        type="password"
        autoComplete="off"
        value={props.text}
        disabled={props.disabled}
        onChange={(event) => { props.onEdit(event.target.value) }}
      />
      <p className={css.hint}>{props.hint}</p>
    </div>
  )
}

/** A boolean control rendered as a labelled checkbox. */
export function CheckField(props: Pick<FieldProps, 'id' | 'label' | 'hint' | 'disabled'> & {
  checked: boolean
  onToggle: (checked: boolean) => void
}) {
  ensureCardCSS()
  return (
    <div className={css.field}>
      <label className={css.check} htmlFor={props.id}>
        <input
          id={props.id}
          className={css.checkbox}
          type="checkbox"
          checked={props.checked}
          disabled={props.disabled}
          onChange={(event) => { props.onToggle(event.target.checked) }}
        />
        <span className={css.checkLabel}>{props.label}</span>
      </label>
      <p className={css.hint}>{props.hint}</p>
    </div>
  )
}

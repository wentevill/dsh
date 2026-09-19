import React from 'react'

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly icon?: React.ReactNode
  readonly variant?: string
  readonly size?: string
}) {
  const { icon, variant: _variant, size: _size, children, ...button } = props
  return <button type="button" {...button}>{icon}{children}</button>
}

export function Switch(props: {
  readonly checked: boolean
  readonly disabled?: boolean
  readonly label: string
  readonly onChange: (next: boolean) => void
}) {
  return <button type="button" role="switch" aria-checked={props.checked} aria-label={props.label}
    disabled={props.disabled} onClick={() => props.onChange(!props.checked)} />
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} />
}

export function Modal(props: {
  readonly open: boolean
  readonly title: string
  readonly className?: string
  readonly children?: React.ReactNode
  readonly footer?: React.ReactNode
}) {
  return props.open ? <div role="dialog" aria-label={props.title} className={props.className}>{props.children}{props.footer}</div> : null
}

export function Menu(props: {
  readonly open: boolean
  readonly anchor: React.ReactNode
  readonly items: readonly { readonly id: string; readonly label: React.ReactNode }[]
  readonly onSelect: (id: string) => void
  readonly onClose: () => void
}) {
  return <span>{props.anchor}{props.open && <span role="menu">{props.items.map(item =>
    <button key={item.id} type="button" role="menuitem" onClick={() => props.onSelect(item.id)}>{item.label}</button>)}</span>}</span>
}

export function IconTrashOutline16() { return <span aria-hidden="true" /> }
export function IconChevronDownOutline14() { return <span aria-hidden="true" /> }

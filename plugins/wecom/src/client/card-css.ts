const P = 'dwm'

export const css = {
  card: `${P}_card`, heading: `${P}_heading`, title: `${P}_title`, description: `${P}_description`,
  status: `${P}_status`, qr: `${P}_qr`, actions: `${P}_actions`, error: `${P}_error`,
  primary: `${P}_primary`, secondary: `${P}_secondary`, danger: `${P}_danger`,
} as const

const STYLE = `
.${css.card}{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);padding:16px}
.${css.heading}{display:flex;flex-direction:column;gap:4px;margin:0 0 14px}
.${css.title}{margin:0;font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary)}
.${css.description}{margin:0;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.${css.status}{margin:0 0 12px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.${css.qr}{display:block;width:240px;height:240px;margin:0 0 14px;border-radius:8px;background:#fff}
.${css.actions}{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.${css.primary},.${css.secondary},.${css.danger}{appearance:none;border:1px solid transparent;border-radius:8px;padding:7px 14px;font:inherit;font-size:13px;font-weight:500;line-height:1.5;cursor:pointer}
.${css.primary}{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.${css.secondary}{border-color:var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary)}
.${css.danger}{border-color:var(--dsw-alias-label-error);background:transparent;color:var(--dsw-alias-label-error)}
.${css.primary}:hover:not(:disabled){opacity:.84}.${css.secondary}:hover:not(:disabled),.${css.danger}:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.${css.primary}:disabled,.${css.secondary}:disabled,.${css.danger}:disabled{opacity:.4;cursor:default}
.${css.primary}:focus-visible,.${css.secondary}:focus-visible,.${css.danger}:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.${css.error}{margin:0 0 12px;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error)}
`

let injected = false
export function ensureWeComCardCSS(): void {
  if (injected || typeof document === 'undefined') return
  injected = true
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-wecom'
  tag.textContent = STYLE
  document.head.appendChild(tag)
}

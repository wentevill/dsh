const P = 'dln'

export const css = {
  card: `${P}_card`, cardOpen: `${P}_cardOpen`, header: `${P}_header`, headText: `${P}_headText`,
  name: `${P}_name`, description: `${P}_description`, chevron: `${P}_chevron`, chevronOpen: `${P}_chevronOpen`,
  body: `${P}_body`, field: `${P}_field`, label: `${P}_label`, input: `${P}_input`, hint: `${P}_hint`,
  check: `${P}_check`, checkbox: `${P}_checkbox`, status: `${P}_status`, footer: `${P}_footer`,
  secondary: `${P}_secondary`, primary: `${P}_primary`, pending: `${P}_pending`, failed: `${P}_failed`,
} as const

export const nextcloudCardStyleText = `
.${css.card}{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);transition:border-color .16s,background .16s}
.${css.card}:hover{border-color:var(--dsw-alias-label-dimmed)}
.${css.cardOpen}{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.${css.header}{width:100%;appearance:none;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px}
.${css.header}:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.${css.headText}{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.${css.name}{font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary)}
.${css.description}{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.${css.chevron}{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}
.${css.chevronOpen}{transform:rotate(180deg)}
.${css.body}{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}
.${css.field}{display:flex;flex-direction:column;gap:6px;padding:12px 0}
.${css.field}+.${css.field}{border-top:1px solid var(--dsw-alias-border-l2)}
.${css.label}{font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}
.${css.input}{min-height:34px;box-sizing:border-box;padding:6px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;color:var(--dsw-alias-label-primary)}
.${css.input}:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary)}
.${css.input}:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.${css.hint}{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.${css.check}{display:flex;align-items:center;gap:8px;padding:12px 0;cursor:pointer;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}
.${css.checkbox}{width:16px;height:16px;margin:0;accent-color:var(--dsw-alias-brand-primary)}
.${css.status}{margin:12px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.${css.failed}{color:var(--dsw-alias-label-error)}
.${css.pending}{flex:none;border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
.${css.footer}{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 0 4px;border-top:1px solid var(--dsw-alias-border-l2)}
.${css.secondary},.${css.primary}{appearance:none;border:1px solid transparent;border-radius:8px;padding:5px 14px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}
.${css.secondary}{border-color:var(--dsw-alias-border-l2);background:none;color:var(--dsw-alias-label-secondary)}
.${css.primary}{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.${css.secondary}:disabled,.${css.primary}:disabled{opacity:.4;cursor:default}
`

let injected = false
export function ensureCardCSS(): void {
  if (injected || typeof document === 'undefined') return
  injected = true
  const tag = document.createElement('style')
  tag.dataset.pluginCss = 'dsh-nextcloud/card'
  tag.textContent = nextcloudCardStyleText
  document.head.appendChild(tag)
}

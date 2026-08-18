/**
 * Self-contained card chrome styling for the mail plugin configuration card.
 *
 * The reference plugin cards (Shell, Agent loop, Web search) ship their styling
 * as CSS modules compiled into the web shell with content-hashed class names.
 * An external client bundle cannot reuse those hashed names without re-running
 * the identical lightningcss pipeline, so this bundle instead owns its own
 * prefixed copy of the same rules. Every selector is namespaced (`dlm_`) to
 * avoid colliding with the shell's unhashed globals, and the rules read the
 * shell's global `--dsw-alias-*` design tokens, so the card renders natively.
 *
 * The stylesheet is injected once per document via a guarded <style> tag.
 */

/** Namespace prefix for every card class. */
const P = 'dlm'

/** Class map the vendored card components reference as `css.<local>`. */
export const css: Record<string, string> = {
  // PluginCard chrome
  card: `${P}_card`,
  cardOpen: `${P}_cardOpen`,
  header: `${P}_header`,
  headText: `${P}_headText`,
  name: `${P}_name`,
  description: `${P}_description`,
  chevron: `${P}_chevron`,
  chevronOpen: `${P}_chevronOpen`,
  body: `${P}_body`,
  readOnly: `${P}_readOnly`,
  pending: `${P}_pending`,
  footer: `${P}_footer`,
  status: `${P}_status`,
  failed: `${P}_failed`,
  discard: `${P}_discard`,
  save: `${P}_save`,
  // field controls
  field: `${P}_field`,
  head: `${P}_head`,
  label: `${P}_label`,
  badges: `${P}_badges`,
  badge: `${P}_badge`,
  badgeMuted: `${P}_badgeMuted`,
  reset: `${P}_reset`,
  input: `${P}_input`,
  inputInvalid: `${P}_inputInvalid`,
  invalid: `${P}_invalid`,
  hint: `${P}_hint`,
  check: `${P}_check`,
  checkbox: `${P}_checkbox`,
  checkLabel: `${P}_checkLabel`,
}

const STYLE = `
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
.${css.readOnly}{margin:12px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.${css.pending}{flex:none;border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px;font-weight:500;white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
.${css.footer}{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 0 4px;border-top:1px solid var(--dsw-alias-border-l2)}
.${css.status}{display:flex;flex-wrap:wrap;gap:6px 12px;padding:12px 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}
.${css.failed}{flex:1;min-width:0;margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error)}
.${css.discard},.${css.save}{appearance:none;border:1px solid transparent;border-radius:8px;padding:5px 14px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}
.${css.discard}{border-color:var(--dsw-alias-border-l2);background:none;color:var(--dsw-alias-label-secondary)}
.${css.discard}:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}
.${css.save}{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.${css.discard}:disabled,.${css.save}:disabled{opacity:.4;cursor:default}
.${css.discard}:focus-visible,.${css.save}:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.${css.field}{display:flex;flex-direction:column;gap:6px;padding:12px 0}
.${css.field}+.${css.field}{border-top:1px solid var(--dsw-alias-border-l2)}
.${css.head}{display:flex;align-items:center;gap:8px}
.${css.label}{flex:1;min-width:0;font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}
.${css.badges}{display:inline-flex;align-items:center;gap:8px}
.${css.badge}{border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px;white-space:nowrap;font-weight:500;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
.${css.badgeMuted}{border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px;white-space:nowrap;color:var(--dsw-alias-label-tertiary)}
.${css.reset}{border:none;background:none;padding:0;font:inherit;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);cursor:pointer}
.${css.reset}:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.${css.reset}:disabled{cursor:default}
.${css.input}{height:34px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px}
.${css.input}:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary)}
.${css.input}:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.${css.inputInvalid}{height:34px;padding:0 12px;border:1px solid var(--dsw-alias-label-error);border-radius:8px;background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}
.${css.invalid}{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error)}
.${css.hint}{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.${css.check}{display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500}
.${css.checkbox}{width:16px;height:16px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.${css.checkbox}:disabled{cursor:default;opacity:.5}
.${css.checkLabel}{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}
`

let injected = false

/** Inject the card stylesheet once. Safe to call from any component render. */
export function ensureCardCSS(): void {
  if (injected || typeof document === 'undefined') return
  injected = true
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-mail'
  tag.dataset.pluginCss = 'dsh-mail/card'
  tag.textContent = STYLE
  document.head.appendChild(tag)
}

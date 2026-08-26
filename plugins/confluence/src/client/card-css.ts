const P = 'dsc'
export const css = Object.fromEntries([
  'card','open','header','headText','name','description','chevron','chevronOpen','body','field','label','input','textarea','check','status','footer','discard','test','save','pending',
].map(key => [key, `${P}_${key}`])) as Record<string, string>

const STYLE = `
.${css.card}{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3)}
.${css.open}{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.${css.header}{width:100%;border:0;background:none;color:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;gap:12px;padding:14px 16px}
.${css.headText}{flex:1;display:flex;flex-direction:column;gap:4px}
.${css.name}{font-size:15px;font-weight:600}
.${css.description}{font-size:13px;color:var(--dsw-alias-label-tertiary)}
.${css.chevron}{color:var(--dsw-alias-label-tertiary);transition:transform .16s}
.${css.chevronOpen}{transform:rotate(180deg)}
.${css.pending}{font-size:11px;padding:1px 8px;border-radius:999px;background:var(--dsw-alias-bg-module-platform)}
.${css.body}{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding:4px 0 8px}
.${css.field}{display:flex;flex-direction:column;gap:6px;padding:10px 0}
.${css.label}{font-size:13px;font-weight:500}
.${css.input},.${css.textarea}{box-sizing:border-box;width:100%;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-3);color:inherit;font:inherit}
.${css.textarea}{resize:vertical}
.${css.check}{display:flex;align-items:center;gap:8px;padding:10px 0;font-size:13px}
.${css.status}{min-height:18px;margin:4px 0 8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.${css.footer}{display:flex;justify-content:flex-end;gap:8px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2)}
.${css.discard},.${css.test},.${css.save}{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 14px;font:inherit;cursor:pointer;background:none;color:inherit}
.${css.save}{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.${css.discard}:disabled,.${css.test}:disabled,.${css.save}:disabled{opacity:.4;cursor:default}
`
let injected = false
export function ensureCardCSS(): void {
  if (injected || typeof document === 'undefined') return
  injected = true
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-confluence'
  tag.textContent = STYLE
  document.head.appendChild(tag)
}

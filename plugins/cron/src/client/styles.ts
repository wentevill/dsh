const STYLE_ID = 'dsh-cron-manager-styles'

export const css = {
  shell: 'dsh-cron-shell', toolbar: 'dsh-cron-toolbar', body: 'dsh-cron-body', list: 'dsh-cron-list',
  details: 'dsh-cron-details', form: 'dsh-cron-form', actions: 'dsh-cron-actions', history: 'dsh-cron-history',
  notice: 'dsh-cron-notice', compact: 'dsh-cron-compact',
} as const

export function ensureCronStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
.dsh-cron-shell{border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:10px;padding:12px;display:grid;gap:12px;max-width:760px}
.dsh-cron-toolbar,.dsh-cron-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.dsh-cron-body{display:grid;grid-template-columns:minmax(150px,1fr) minmax(260px,2fr);gap:12px}
.dsh-cron-list,.dsh-cron-history{list-style:none;margin:0;padding:0;display:grid;gap:6px}.dsh-cron-list button{width:100%;text-align:left}.dsh-cron-details{display:grid;gap:8px;min-width:0}.dsh-cron-form{display:grid;gap:8px}.dsh-cron-form label{display:grid;gap:4px}.dsh-cron-form input,.dsh-cron-form textarea,.dsh-cron-form select{font:inherit;padding:6px}.dsh-cron-notice{opacity:.72}.dsh-cron-compact{display:flex;gap:8px;align-items:center;padding:8px 0}
@media(max-width:640px){.dsh-cron-body{grid-template-columns:1fr}}
`
  document.head.append(style)
}

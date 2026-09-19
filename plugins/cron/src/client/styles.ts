const STYLE_ID = 'dsh-cron-manager-styles'

export const css = {
  shell: 'dsh-cron-shell', toolbar: 'dsh-cron-toolbar',
  toolbarActions: 'dsh-cron-toolbar-actions', list: 'dsh-cron-list', row: 'dsh-cron-row',
  rowMain: 'dsh-cron-row-main', rowOpen: 'dsh-cron-row-open', rowActions: 'dsh-cron-row-actions',
  readonly: 'dsh-cron-readonly', form: 'dsh-cron-form', history: 'dsh-cron-history',
  historySection: 'dsh-cron-history-section', dialog: 'dsh-cron-dialog', dialogContent: 'dsh-cron-dialog-content',
  modeButton: 'dsh-cron-mode-button',
  danger: 'dsh-cron-danger', dangerButton: 'dsh-cron-danger-button',
  notice: 'dsh-cron-notice', compact: 'dsh-cron-compact',
} as const

export function ensureCronStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID) !== null) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
.dsh-cron-shell{display:grid;gap:12px;color:var(--dsw-alias-label-primary)}
.dsh-cron-toolbar,.dsh-cron-toolbar-actions,.dsh-cron-row-actions{display:flex;gap:8px;align-items:center}.dsh-cron-toolbar{justify-content:flex-end;flex-wrap:wrap}
.dsh-cron-list,.dsh-cron-history{list-style:none;margin:0;padding:0}.dsh-cron-list{display:flex;flex-direction:column;gap:2px}
.dsh-cron-row{display:flex;align-items:center;gap:16px;min-width:0;margin:0 -8px;padding:8px;border-radius:12px}.dsh-cron-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-cron-row-main,.dsh-cron-row-open{display:grid;grid-template-columns:minmax(140px,220px) minmax(0,1fr);align-items:center;gap:16px;min-width:0;flex:1}
.dsh-cron-row-open{padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}.dsh-cron-row-open:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:6px}
.dsh-cron-row code,.dsh-cron-history code{font-size:13px;color:var(--dsw-alias-label-secondary)}.dsh-cron-row-open span,.dsh-cron-row-main span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:500}
.dsh-cron-row-actions{justify-content:flex-end;flex:none}.dsh-cron-readonly,.dsh-cron-notice{font-size:13px;color:var(--dsw-alias-label-tertiary)}
.dsh-cron-danger{color:var(--dsw-alias-state-error-primary)}.dsh-cron-danger-button{background:var(--dsw-alias-state-error-primary)}
.dsh-cron-dialog{width:min(720px,calc(100vw - 32px));max-width:720px}.dsh-cron-dialog-content{max-height:min(76vh,760px)}.dsh-cron-form{display:grid;gap:12px}.dsh-cron-form label{display:grid;gap:6px;font-size:13px;color:var(--dsw-alias-label-secondary)}
.dsh-cron-form label>span{width:100%}.dsh-cron-form textarea{box-sizing:border-box;width:100%;min-height:120px;padding:8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;background-color:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;resize:vertical}.dsh-cron-form textarea:focus{outline:1px solid var(--dsw-alias-brand-primary)}.dsh-cron-mode-button{display:flex;width:100%;justify-content:space-between}
.dsh-cron-history-section{display:grid;gap:6px;margin-top:16px;padding-top:12px;border-top:.5px solid var(--dsw-alias-border-l4)}.dsh-cron-history{display:grid;gap:4px}.dsh-cron-history li{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-cron-compact{display:flex;gap:8px;align-items:center;padding:8px 0}
[data-plugin-detail="dsh-cron"] [data-plugin-rows]{order:1}
[data-plugin-detail="dsh-cron"] [data-plugin-config]{order:2}
@media(max-width:640px){.dsh-cron-row-main,.dsh-cron-row-open{grid-template-columns:1fr;gap:2px}.dsh-cron-row{align-items:flex-start}.dsh-cron-row-actions{padding-top:4px}}
`
  document.head.append(style)
}

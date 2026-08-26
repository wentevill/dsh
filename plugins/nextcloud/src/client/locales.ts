export const en = {
  title: 'Nextcloud Files', description: 'Connect one Nextcloud account with an application password.',
  serverUrl: 'Server URL', username: 'Username', password: 'Application password', accessMode: 'Directory access',
  all: 'All directories', allowlist: 'Configured directories only', roots: 'Allowed directories (one absolute path per line)',
  allowDelete: 'Allow recursive deletion', allowHttp: 'Allow cleartext HTTP (unsafe)', skipTlsVerify: 'Skip TLS certificate verification (unsafe)',
  save: 'Save', discard: 'Discard', test: 'Test connection', unsaved: 'Unsaved', expand: 'Expand', collapse: 'Collapse',
  saved: 'Settings saved.', connected: 'Connection succeeded.', failed: 'Operation failed.',
}
export const zh = {
  title: 'Nextcloud 文件', description: '使用应用密码连接一个 Nextcloud 账号。',
  serverUrl: '服务器地址', username: '用户名', password: '应用密码', accessMode: '目录访问范围',
  all: '全部目录', allowlist: '仅配置的目录', roots: '允许目录（每行一个绝对路径）',
  allowDelete: '允许递归删除', allowHttp: '允许明文 HTTP（不安全）', skipTlsVerify: '跳过 TLS 证书校验（不安全）',
  save: '保存', discard: '放弃修改', test: '测试连接', unsaved: '未保存', expand: '展开', collapse: '收起',
  saved: '设置已保存。', connected: '连接成功。', failed: '操作失败。',
}
export type LocaleKey = keyof typeof en

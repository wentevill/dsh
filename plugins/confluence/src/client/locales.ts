export const en = {
  title: 'Confluence Data Center', description: 'Configure the site URL, personal access token, and allowed spaces.',
  baseUrl: 'HTTPS base URL', token: 'Personal Access Token', allowAll: 'Allow every space accessible to the token',
  spaces: 'Allowed Space Keys (one per line)', unsaved: 'Unsaved', unconfigured: 'Not configured',
  saving: 'Saving…', saved: 'Saved', testing: 'Testing…', connected: 'Connected',
  discarded: 'Changes discarded', loadFailed: 'Failed to load settings', saveFailed: 'Save failed', testFailed: 'Connection test failed',
  tokenSaveFailed: 'Failed to save token', discard: 'Discard changes', test: 'Test connection', save: 'Save',
  expand: 'Show settings', collapse: 'Hide settings',
}

export const zh = {
  title: 'Confluence 数据中心', description: '配置站点地址、个人访问令牌与允许访问的空间。',
  baseUrl: 'HTTPS 基础地址', token: '个人访问令牌', allowAll: '允许令牌可访问的全部空间',
  spaces: '允许的空间 Key（每行一个）', unsaved: '未保存', unconfigured: '未配置',
  saving: '正在保存…', saved: '已保存', testing: '正在测试…', connected: '连接成功',
  discarded: '已放弃修改', loadFailed: '加载配置失败', saveFailed: '保存失败', testFailed: '连接测试失败',
  tokenSaveFailed: '令牌保存失败', discard: '放弃修改', test: '测试连接', save: '保存',
  expand: '展开设置', collapse: '收起设置',
}

export type ConfluenceLocaleKey = keyof typeof en

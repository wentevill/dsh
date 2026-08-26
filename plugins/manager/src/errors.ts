export type PluginManagerErrorCode =
  | 'ARCHIVE_INVALID'
  | 'ARCHIVE_UNSAFE_ENTRY'
  | 'PACKAGE_INVALID'
  | 'PACKAGE_INCOMPLETE'
  | 'PACKAGE_DEPENDENCY_UNSAFE'
  | 'DOWNGRADE_BLOCKED'
  | 'MANAGER_PROTECTED'
  | 'OPERATION_BUSY'
  | 'UPLOAD_INVALID'
  | 'UPLOAD_SEQUENCE_INVALID'
  | 'UPLOAD_NOT_FOUND'
  | 'PLUGIN_NOT_FOUND'
  | 'PLUGIN_STATE_CHANGED'
  | 'RUNTIME_UNAVAILABLE'
  | 'INSTALL_FAILED'
  | 'UNINSTALL_FAILED'

export class PluginManagerError extends Error {
  constructor(
    readonly code: PluginManagerErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'PluginManagerError'
  }
}

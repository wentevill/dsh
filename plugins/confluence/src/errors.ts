export type ConfluenceErrorCode =
  | 'CONFLUENCE_UNAUTHORIZED'
  | 'CONFLUENCE_FORBIDDEN'
  | 'CONFLUENCE_NOT_FOUND'
  | 'CONFLUENCE_CONFLICT'
  | 'CONFLUENCE_RATE_LIMITED'
  | 'CONFLUENCE_UNAVAILABLE'
  | 'CONFLUENCE_REDIRECT_REJECTED'
  | 'CONFLUENCE_RESPONSE_INVALID'
  | 'CONFLUENCE_RESPONSE_TOO_LARGE'
  | 'CONFLUENCE_WRITE_INDETERMINATE'
  | 'CONFLUENCE_NETWORK_ERROR'
  | 'CONFLUENCE_INPUT_INVALID'
  | 'CONFLUENCE_SPACE_FORBIDDEN'

export class ConfluenceError extends Error {
  constructor(message: string, readonly code: ConfluenceErrorCode, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ConfluenceError'
  }
}

export function confluenceError(message: string, code: ConfluenceErrorCode): ConfluenceError {
  return new ConfluenceError(`confluence: ${message}`, code)
}

export interface AuthErrors {
  readonly action?: string
  readonly polling?: string
}

export function clearPollingError(errors: AuthErrors): AuthErrors {
  return errors.action === undefined ? {} : { action: errors.action }
}

export function visibleAuthError(errors: AuthErrors): string | undefined {
  return errors.action ?? errors.polling
}

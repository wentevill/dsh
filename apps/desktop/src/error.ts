export interface DesktopDiagnostic {
  stage: string
  detail: string
}

const MAX_DIAGNOSTIC_BYTES = 32 * 1024

export function boundedDiagnostic(
  stage: string,
  detail: string,
  _environment?: Readonly<Record<string, string | undefined>>,
): DesktopDiagnostic {
  const bytes = new TextEncoder().encode(detail)
  return {
    stage,
    detail: new TextDecoder().decode(bytes.slice(0, MAX_DIAGNOSTIC_BYTES)),
  }
}

import type { WeComAuthSnapshot } from './auth.ts'

export interface AuthRemoteController {
  snapshot(): WeComAuthSnapshot
  connect(): Promise<void>
  cancel(): void
  refresh(): Promise<void>
  deleteAuthorization(confirmed: boolean): Promise<void>
}

/** Transport-neutral facade. Connect returns immediately so the UI can poll for the QR. */
export function createAuthRemoteApi(controller: AuthRemoteController) {
  return {
    status: () => controller.snapshot(),
    connect(): WeComAuthSnapshot {
      void controller.connect()
      return controller.snapshot()
    },
    cancel(): WeComAuthSnapshot {
      controller.cancel()
      return controller.snapshot()
    },
    async refresh(): Promise<WeComAuthSnapshot> {
      await controller.refresh()
      return controller.snapshot()
    },
    async deleteAuthorization(confirmed: boolean): Promise<WeComAuthSnapshot> {
      await controller.deleteAuthorization(confirmed)
      return controller.snapshot()
    },
  }
}

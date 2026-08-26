interface RemoteFailure { ok: false; error: { message: string } }
interface RemoteSuccess<T> { ok: true; value: T }

export function unwrapRemote<T>(response: RemoteFailure | RemoteSuccess<T>): T {
  if (!response.ok) throw new Error(response.error.message)
  return response.value
}

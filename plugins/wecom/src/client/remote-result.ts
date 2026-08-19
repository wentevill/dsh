import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { WeComAuthSnapshot } from '../remote-types.ts'

/** Convert the generated transport envelope into the card's business state. */
export function unwrapAuthResult(response: RemoteResult<WeComAuthSnapshot>): WeComAuthSnapshot {
  if (!response.ok) throw new Error(response.error.message)
  return response.value
}

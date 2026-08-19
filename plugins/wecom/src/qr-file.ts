import { readFile } from 'node:fs/promises'

function abortError(): Error {
  return Object.assign(new Error('authorization cancelled'), { name: 'AbortError' })
}

/** Poll the CLI-produced QR file without exposing its path to the browser. */
export async function waitForFile(path: string, signal: AbortSignal, intervalMs = 100): Promise<Uint8Array> {
  for (;;) {
    if (signal.aborted) throw abortError()
    try {
      const bytes = await readFile(path)
      if (bytes.byteLength > 0) return bytes
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, intervalMs)
      signal.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(abortError())
      }, { once: true })
    })
  }
}

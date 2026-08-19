import { readFile } from 'node:fs/promises';
function abortError() {
    return Object.assign(new Error('authorization cancelled'), { name: 'AbortError' });
}
/** Poll the CLI-produced QR file without exposing its path to the browser. */
export async function waitForFile(path, signal, intervalMs = 100) {
    for (;;) {
        if (signal.aborted)
            throw abortError();
        try {
            const bytes = await readFile(path);
            if (bytes.byteLength > 0)
                return bytes;
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                throw error;
        }
        await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, intervalMs);
            signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(abortError());
            }, { once: true });
        });
    }
}

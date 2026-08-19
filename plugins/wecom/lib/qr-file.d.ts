/** Poll the CLI-produced QR file without exposing its path to the browser. */
export declare function waitForFile(path: string, signal: AbortSignal, intervalMs?: number): Promise<Uint8Array>;

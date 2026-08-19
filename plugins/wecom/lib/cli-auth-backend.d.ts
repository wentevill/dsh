import type { AuthBackend } from './auth.ts';
import type { ProcessExecutor } from './transport.ts';
interface CliAuthBackendOptions {
    readonly executable: string;
    readonly configDir: string;
    readonly tempDir: string;
    readonly execute: ProcessExecutor;
    readonly readQr: (path: string, signal: AbortSignal) => Promise<Uint8Array>;
    readonly deleteOwned: () => Promise<void>;
}
/** Bind the fixed auth commands and QR file to one profile-owned CLI directory. */
export declare function createCliAuthBackend(options: CliAuthBackendOptions): AuthBackend;
export {};

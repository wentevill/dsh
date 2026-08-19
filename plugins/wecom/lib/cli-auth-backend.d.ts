import type { AuthBackend } from './auth.ts';
import type { ProcessExecutor } from './transport.ts';
export interface AuthPty {
    onData(listener: (data: string) => void): {
        dispose(): void;
    };
    onExit(listener: (event: {
        exitCode: number;
    }) => void): {
        dispose(): void;
    };
    write(data: string): void;
    kill(): void;
}
export type AuthPtySpawn = (executable: string, args: string[], options: {
    name: string;
    cols: number;
    rows: number;
    cwd: string;
    env: Record<string, string>;
}) => AuthPty;
interface CliAuthBackendOptions {
    readonly executable: string;
    readonly configDir: string;
    readonly tempDir: string;
    readonly execute: ProcessExecutor;
    readonly readQr: (path: string, signal: AbortSignal) => Promise<Uint8Array>;
    readonly deleteOwned: () => Promise<void>;
    readonly ptySpawn?: AuthPtySpawn;
}
export interface CliAuthBackend extends AuthBackend {
    provision(botId: string, secret: string, signal?: AbortSignal): Promise<void>;
}
/** Bind the fixed auth commands and QR file to one profile-owned CLI directory. */
export declare function createCliAuthBackend(options: CliAuthBackendOptions): CliAuthBackend;
export {};

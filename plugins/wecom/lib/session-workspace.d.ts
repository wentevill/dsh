import type { SessionId } from '@deepseek-ai/dsh-session/types';
import z from '@deepseek-ai/schemastery';
export declare function defaultSessionWorkspaceTemplate(): string;
export declare const sessionWorkspaceTemplateSchema: z<string, string>;
export declare function resolveSessionWorkspace(template: string, sessionId: SessionId): string;

import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { Workspace, WorkspaceRegistry } from '@deepseek-ai/dsh-workspace';
/** Resolve exactly one live Workspace owner for a Session, failing closed. */
export declare function workspaceForSession(registry: Pick<WorkspaceRegistry, 'list'>, sessionId: SessionId): Workspace;

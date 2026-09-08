import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Workspace, WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import { cronFailure } from './errors.ts'

/** Resolve exactly one live Workspace owner for a Session, failing closed. */
export function workspaceForSession(
  registry: Pick<WorkspaceRegistry, 'list'>,
  sessionId: SessionId,
): Workspace {
  const owners = registry.list().filter(workspace => workspace.sessionIds.includes(sessionId))
  if (owners.length !== 1) {
    throw cronFailure('workspace_context_unavailable')
  }
  return owners[0]!
}

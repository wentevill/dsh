import { cronFailure } from "./errors.js";
/** Resolve exactly one live Workspace owner for a Session, failing closed. */
export function workspaceForSession(registry, sessionId) {
    const owners = registry.list().filter(workspace => workspace.sessionIds.includes(sessionId));
    if (owners.length !== 1) {
        throw cronFailure('workspace_context_unavailable');
    }
    return owners[0];
}

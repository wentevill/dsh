import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'

export interface ConfluenceApprovalPreparer {
  prepareMutation(exec: Readonly<ToolExecution>): Promise<{ reason: string }>
}

export function createConfluenceApprovalPolicy(preparer: ConfluenceApprovalPreparer) {
  return async (exec: Readonly<ToolExecution>, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
    if (exec.name !== 'confluence_create_page' && exec.name !== 'confluence_update_page') return next()
    const metadata = await preparer.prepareMutation(exec)
    return { kind: 'ask', reason: metadata.reason }
  }
}

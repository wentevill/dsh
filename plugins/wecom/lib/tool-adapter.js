import { approvalReason, classifyOperation } from "./policy.js";
/** Bind one discovered method to policy and the profile-confined CLI runner. */
export function createRuntimeTool(method, runner) {
    const risk = classifyOperation(method);
    return {
        method,
        risk,
        preDecision(args) {
            return risk === 'read' ? { kind: 'allow' } : { kind: 'ask', reason: approvalReason(method, args) };
        },
        async execute(args, signal) {
            return (await runner.run({ path: method.path, body: args, signal })).value;
        },
    };
}

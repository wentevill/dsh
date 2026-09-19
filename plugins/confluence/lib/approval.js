export function createConfluenceApprovalPolicy(preparer) {
    return async (exec, next) => {
        if (exec.name !== 'confluence_create_page' && exec.name !== 'confluence_update_page' && exec.name !== 'confluence_delete_page')
            return next();
        if (preparer.ownsMutation?.(exec.name) === false)
            return next();
        const metadata = await preparer.prepareMutation(exec);
        return { kind: 'ask', reason: metadata.reason };
    };
}

function formatAddress(value) {
    return value.name === undefined ? value.address : `${value.name} <${value.address}>`;
}
function formatAddresses(values) {
    return values.length === 0 ? '(none)' : values.map(formatAddress).join(', ');
}
function sendReason(metadata) {
    const total = metadata.to.length + metadata.cc.length + metadata.bccCount;
    const formats = metadata.formats.length === 0 ? '(none)' : metadata.formats.join(', ');
    const attachments = metadata.attachments.length === 0 ? '(none)' : metadata.attachments.join(', ');
    return `Send email? To (${metadata.to.length}): ${formatAddresses(metadata.to)}; Cc (${metadata.cc.length}): ${formatAddresses(metadata.cc)}; recipients: ${total} total; subject: ${JSON.stringify(metadata.subject)}; formats: ${formats}; attachments: ${attachments}; attachment bytes: ${metadata.attachmentBytes} bytes.`;
}
function deleteReason(metadata) {
    return `Permanently delete email UID ${metadata.id}? Subject: ${JSON.stringify(metadata.subject)}; From: ${formatAddresses(metadata.from)}.`;
}
/** Fresh one-shot approval policy for Mail's two mutating operations. */
export function createMailApprovalPolicy(preparer) {
    return async (exec, next) => {
        if (exec.name === 'mail_send')
            return { kind: 'ask', reason: sendReason(await preparer.prepareSend(exec)) };
        if (exec.name === 'mail_delete')
            return { kind: 'ask', reason: deleteReason(await preparer.prepareDelete(exec)) };
        return next();
    };
}

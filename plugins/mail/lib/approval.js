function quoteUntrusted(value) {
    // C0/C1 controls, ANSI ESC, and Unicode bidi/format controls cannot alter
    // the structure or visual ordering of an approval prompt.
    return JSON.stringify(value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '\uFFFD'));
}
function formatAddress(value) {
    return value.name === undefined
        ? quoteUntrusted(value.address)
        : `${quoteUntrusted(value.name)} <${quoteUntrusted(value.address)}>`;
}
function formatAddresses(values) {
    return values.length === 0 ? '(none)' : values.map(formatAddress).join(', ');
}
function sendReason(metadata) {
    const total = metadata.to.length + metadata.cc.length + metadata.bccCount;
    const formats = metadata.formats.length === 0 ? '(none)' : metadata.formats.join(', ');
    const attachments = metadata.attachments.length === 0 ? '(none)' : metadata.attachments.map(quoteUntrusted).join(', ');
    return `Send email? To (${metadata.to.length}): ${formatAddresses(metadata.to)}; Cc (${metadata.cc.length}): ${formatAddresses(metadata.cc)}; recipients: ${total} total; subject: ${quoteUntrusted(metadata.subject)}; formats: ${formats}; attachments: ${attachments}; attachment bytes: ${metadata.attachmentBytes} bytes.`;
}
function deleteReason(metadata) {
    return `Permanently delete email UID ${quoteUntrusted(metadata.id)}? Subject: ${quoteUntrusted(metadata.subject)}; From: ${formatAddresses(metadata.from)}.`;
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

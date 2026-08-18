import nodemailer, {} from 'nodemailer';
import { normalizeBodies } from "./html.js";
function smtpError(code, message) {
    return new Error(`${code}: ${message}`);
}
function singleLine(value, label, required = true) {
    if (value === undefined && !required)
        return undefined;
    if (typeof value !== 'string' || (required && value.length === 0) || /[\r\n]/u.test(value)) {
        throw smtpError('MAIL_HEADER_INVALID', `${label} must be a ${required ? 'non-empty ' : ''}single-line string`);
    }
    return value;
}
function snapshotAddress(input) {
    if (input === null || typeof input !== 'object')
        throw smtpError('MAIL_HEADER_INVALID', 'recipient must be an address object');
    const source = input;
    const address = singleLine(source.address, 'recipient address');
    const name = singleLine(source.name, 'recipient name', false);
    return name === undefined ? { address } : { address, name };
}
function snapshotAddresses(input, label, required) {
    if (input === undefined && !required)
        return undefined;
    if (!Array.isArray(input) || (required && input.length === 0)) {
        throw smtpError('MAIL_RECIPIENT_REQUIRED', `${label} must contain at least one recipient`);
    }
    return input.map(snapshotAddress);
}
function snapshotAttachment(input) {
    if (input === null || typeof input !== 'object')
        throw smtpError('MAIL_ATTACHMENT_INVALID', 'attachment must be a loaded Buffer');
    const source = input;
    if ('path' in source || 'href' in source || 'url' in source || 'encoding' in source) {
        throw smtpError('MAIL_ATTACHMENT_INVALID', 'attachment paths, URLs, and encodings are not allowed');
    }
    const filename = singleLine(source.filename, 'attachment filename');
    const contentType = singleLine(source.contentType, 'attachment content type');
    const content = source.content;
    const size = source.size;
    if (!Buffer.isBuffer(content) || typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0 || size !== content.length) {
        throw smtpError('MAIL_ATTACHMENT_INVALID', 'attachment must contain an intact loaded Buffer');
    }
    return { filename: filename, contentType: contentType, content };
}
function snapshotAttachments(input) {
    if (input === undefined)
        return undefined;
    if (!Array.isArray(input))
        throw smtpError('MAIL_ATTACHMENT_INVALID', 'attachments must be an array');
    return input.map(snapshotAttachment);
}
function defaultCreateSmtpClient(options) {
    return nodemailer.createTransport(options);
}
/** TLS-only SMTP sender that builds MIME only from snapshots and loaded attachment Buffers. */
export class MailSmtpTransport {
    createClient;
    constructor(createClient = defaultCreateSmtpClient) {
        this.createClient = createClient;
    }
    async send(config, password, request, signal) {
        signal?.throwIfAborted();
        if (!config.smtp.secure)
            throw new Error('SMTP must use TLS');
        const to = snapshotAddresses(request.to, 'to', true);
        const cc = snapshotAddresses(request.cc, 'cc', false);
        const bcc = snapshotAddresses(request.bcc, 'bcc', false);
        const subject = singleLine(request.subject, 'subject');
        const from = singleLine(config.username, 'sender');
        const bodies = normalizeBodies({
            ...(request.text === undefined ? {} : { text: request.text }),
            ...(request.html === undefined ? {} : { html: request.html }),
        });
        const attachments = snapshotAttachments(request.attachments);
        const client = this.createClient({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: config.smtp.secure,
            ignoreTLS: false,
            auth: { user: config.username, pass: password },
            logger: false,
            debug: false,
            disableFileAccess: true,
            disableUrlAccess: true,
            tls: { rejectUnauthorized: true, servername: config.smtp.host },
        });
        let closed = false;
        const close = () => {
            if (closed)
                return;
            closed = true;
            client.close();
        };
        signal?.addEventListener('abort', close, { once: true });
        try {
            signal?.throwIfAborted();
            const result = await client.sendMail({
                from,
                to,
                ...(cc === undefined ? {} : { cc }),
                ...(bcc === undefined ? {} : { bcc }),
                subject,
                ...bodies,
                ...(attachments === undefined ? {} : { attachments }),
                disableFileAccess: true,
                disableUrlAccess: true,
            });
            signal?.throwIfAborted();
            return { messageId: result.messageId };
        }
        finally {
            signal?.removeEventListener('abort', close);
            close();
        }
    }
}

import nodemailer, {} from 'nodemailer';
import { mailError } from "./errors.js";
import { normalizeBodies } from "./html.js";
function smtpError(code, message) {
    return mailError(message, code);
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
    const requiredKeys = ['content', 'contentType', 'filename', 'size'];
    const keys = Reflect.ownKeys(source).sort((left, right) => String(left).localeCompare(String(right)));
    if (Object.getPrototypeOf(source) !== Object.prototype
        || keys.length !== 4
        || keys.some((key, index) => typeof key !== 'string' || key !== requiredKeys[index])) {
        throw smtpError('MAIL_ATTACHMENT_INVALID', 'attachment must use the exact loaded Buffer schema');
    }
    const descriptors = Object.getOwnPropertyDescriptors(source);
    const values = ['filename', 'contentType', 'content', 'size'].map(key => {
        const descriptor = descriptors[key];
        if (descriptor === undefined || !('value' in descriptor)) {
            throw smtpError('MAIL_ATTACHMENT_INVALID', 'attachment fields must be plain values');
        }
        return descriptor.value;
    });
    const [filenameValue, contentTypeValue, content, size] = values;
    const filename = singleLine(filenameValue, 'attachment filename');
    const contentType = singleLine(contentTypeValue, 'attachment content type');
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
            throw mailError('SMTP must use TLS', 'MAIL_TLS_REQUIRED');
        const to = snapshotAddresses(request.to, 'to', true);
        const cc = snapshotAddresses(request.cc, 'cc', false);
        const bcc = snapshotAddresses(request.bcc, 'bcc', false);
        const subject = singleLine(request.subject, 'subject');
        const from = singleLine(config.username, 'sender');
        const text = request.text;
        const html = request.html;
        const bodies = normalizeBodies({
            ...(text === undefined ? {} : { text }),
            ...(html === undefined ? {} : { html }),
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
            return { messageId: result.messageId };
        }
        finally {
            client.close();
        }
    }
}

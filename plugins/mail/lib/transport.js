import nodemailer from 'nodemailer';
import { MailImapTransport } from "./imap-transport.js";
function assertNotAborted(signal) {
    signal?.throwIfAborted();
}
/** Backwards-compatible combined IMAP/SMTP facade; IMAP operations delegate to MailImapTransport. */
export class NodeMailTransport {
    imap;
    constructor(imap = new MailImapTransport()) {
        this.imap = imap;
    }
    list(config, password, request, signal) {
        return this.imap.list(config, password, request, signal);
    }
    read(config, password, request, signal) {
        return this.imap.read(config, password, request, signal);
    }
    archive(config, password, request, signal) {
        return this.imap.archive(config, password, request, signal);
    }
    delete(config, password, request, signal) {
        return this.imap.delete(config, password, request, signal);
    }
    async send(config, password, request, signal) {
        assertNotAborted(signal);
        if (!config.smtp.secure)
            throw new Error('SMTP must use TLS');
        const transport = nodemailer.createTransport({
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
        const abort = () => transport.close();
        signal?.addEventListener('abort', abort, { once: true });
        try {
            const result = await transport.sendMail({
                from: config.username,
                to: [...request.to],
                ...(request.cc === undefined ? {} : { cc: [...request.cc] }),
                subject: request.subject,
                text: request.text,
                disableFileAccess: true,
                disableUrlAccess: true,
            });
            return { messageId: result.messageId };
        }
        finally {
            signal?.removeEventListener('abort', abort);
            transport.close();
        }
    }
}

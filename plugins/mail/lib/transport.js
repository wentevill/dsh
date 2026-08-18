import { MailImapTransport } from "./imap-transport.js";
import { MailSmtpTransport } from "./smtp-transport.js";
/** Backwards-compatible combined IMAP/SMTP facade; IMAP operations delegate to MailImapTransport. */
export class NodeMailTransport {
    imap;
    smtp;
    constructor(imap = new MailImapTransport(), smtp = new MailSmtpTransport()) {
        this.imap = imap;
        this.smtp = smtp;
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
        return this.smtp.send(config, password, request, signal);
    }
}

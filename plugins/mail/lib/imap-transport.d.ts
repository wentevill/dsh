import { ImapFlow, type ImapFlowOptions } from 'imapflow';
import type { MailArchiveRequest, MailArchiveResult, MailDeleteRequest, MailDeleteResult, MailListRequest, MailListResult, MailReadRequest, MailReadResult } from './mail-types.ts';
import type { ResolvedConfig } from './index.ts';
/** Narrow ImapFlow surface used by Mail and injectable in transport tests. */
export type ImapFlowClient = Pick<ImapFlow, 'capabilities' | 'close' | 'connect' | 'enabled' | 'fetchAll' | 'fetchOne' | 'getMailboxLock' | 'list' | 'logout' | 'mailbox' | 'messageDelete' | 'messageMove'>;
export type ImapFlowFactory = (options: ImapFlowOptions) => ImapFlowClient;
/** TLS-only IMAP list, read, archive, and permanent UID deletion transport. */
export declare class MailImapTransport {
    private readonly createClient;
    constructor(createClient?: ImapFlowFactory);
    list(config: ResolvedConfig, password: string, request: MailListRequest, signal?: AbortSignal): Promise<MailListResult>;
    read(config: ResolvedConfig, password: string, request: MailReadRequest, signal?: AbortSignal): Promise<MailReadResult>;
    archive(config: ResolvedConfig, password: string, request: MailArchiveRequest, signal?: AbortSignal): Promise<MailArchiveResult>;
    delete(config: ResolvedConfig, password: string, request: MailDeleteRequest, signal?: AbortSignal): Promise<MailDeleteResult>;
    private withImap;
}

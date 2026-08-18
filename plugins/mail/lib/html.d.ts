export interface MailBodies {
    readonly text?: string;
    readonly html?: string;
}
/** Preserves supplied plain text, or derives it from a bounded HTML body. */
export declare function normalizeBodies(bodies: MailBodies): {
    text: string;
    html?: string;
};

export class ConfluenceError extends Error {
    code;
    constructor(message, code, options) {
        super(message, options);
        this.code = code;
        this.name = 'ConfluenceError';
    }
}
export function confluenceError(message, code) {
    return new ConfluenceError(`confluence: ${message}`, code);
}

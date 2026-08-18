import { convert } from 'html-to-text';
const MAX_TEXT_CHARS = 500_000;
const MAX_HTML_CHARS = 1_000_000;
const HTML_TO_TEXT_OPTIONS = {
    selectors: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(selector => ({ selector, options: { uppercase: false } })),
};
function bodyError(code, message) {
    return new Error(`${code}: ${message}`);
}
function snapshotBody(value, name, maxChars) {
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string')
        throw bodyError('MAIL_BODY_INVALID', `${name} body must be a string`);
    if (value.length > maxChars)
        throw bodyError('MAIL_BODY_TOO_LARGE', `${name} body exceeds ${maxChars} characters`);
    return value;
}
/** Preserves supplied plain text, or derives it from a bounded HTML body. */
export function normalizeBodies(bodies) {
    const text = snapshotBody(bodies.text, 'text', MAX_TEXT_CHARS);
    const html = snapshotBody(bodies.html, 'html', MAX_HTML_CHARS);
    if (text === undefined && html === undefined)
        throw bodyError('MAIL_BODY_REQUIRED', 'text or html body is required');
    if (html === undefined)
        return { text: text };
    return { text: text ?? convert(html, HTML_TO_TEXT_OPTIONS), html };
}

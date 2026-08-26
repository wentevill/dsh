import { confluenceError } from "./errors.js";
function literal(value) {
    if (value.length === 0 || value.length > 500 || /[\r\n]/u.test(value))
        throw confluenceError('CQL value is invalid', 'CONFLUENCE_INPUT_INVALID');
    return `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`;
}
export function buildPageCql(input) {
    const allowed = new Map(input.allowedSpaces.map(key => [key.toUpperCase(), key]));
    const requested = input.requestedSpaces.map(key => {
        const normalized = key.trim();
        if (!input.allowAllSpaces && !allowed.has(normalized.toUpperCase())) {
            throw confluenceError(`space ${JSON.stringify(normalized)} is not allowed`, 'CONFLUENCE_SPACE_FORBIDDEN');
        }
        return normalized;
    });
    const spaces = requested.length > 0 ? requested : input.allowAllSpaces ? [] : input.allowedSpaces;
    const clauses = ['type = page', `siteSearch ~ ${literal(input.query.trim())}`];
    for (const label of input.labels)
        clauses.push(`label = ${literal(label.trim())}`);
    if (spaces.length > 0)
        clauses.push(`space IN (${spaces.map(literal).join(', ')})`);
    return clauses.join(' AND ');
}

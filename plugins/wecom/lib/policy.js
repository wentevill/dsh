const READ = new Set(['get', 'list', 'search', 'show', 'status', 'whoami', 'read', 'detail', 'download']);
const WRITE = new Set(['send', 'create', 'update', 'append', 'upload', 'rename', 'finish', 'add', 'import']);
const HIGH_RISK = new Set(['delete', 'cancel', 'overwrite', 'remove', 'permission', 'permissions', 'members', 'rules']);
/** Classify by explicit confirmation metadata and deny-biased full-path vocabulary. */
export function classifyOperation(method) {
    const request = method.requestRef === undefined ? undefined : method.schemas[method.requestRef];
    if (request?.['x-wecom-confirm'] === true)
        return 'write';
    const segments = method.path.map(segment => segment.toLowerCase());
    if (segments.some(segment => HIGH_RISK.has(segment)))
        return 'high-risk';
    const operation = segments.at(-1);
    if (operation !== undefined && READ.has(operation))
        return 'read';
    if (operation !== undefined && WRITE.has(operation))
        return 'write';
    return 'high-risk';
}
function safeValue(value, depth = 0) {
    if (depth >= 3)
        return '[truncated]';
    if (value === null || typeof value === 'boolean' || typeof value === 'number')
        return value;
    if (typeof value === 'string')
        return value.slice(0, 200);
    if (Array.isArray(value))
        return value.slice(0, 5).map(item => safeValue(item, depth + 1));
    if (typeof value !== 'object')
        return String(value).slice(0, 200);
    const entries = Object.entries(value)
        .filter(([key]) => !/(?:secret|token|password|credential|authorization)/iu.test(key))
        .slice(0, 8)
        .map(([key, item]) => [key, safeValue(item, depth + 1)]);
    return Object.fromEntries(entries);
}
/** Render a bounded, credential-redacted reason for DSH's approval service. */
export function approvalReason(method, args) {
    return `Allow WeCom ${method.path.join('.')} with ${JSON.stringify(safeValue(args))}?`;
}

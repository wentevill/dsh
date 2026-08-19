import { WeComCliError } from "./transport.js";
function timestamp(value) {
    const pad = (part) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}
function hasFamily(methods, family) {
    return methods.some(method => method.path[0] === family);
}
/** Remove only API families proven permanently unavailable by a read-only probe. */
export async function filterAvailableMethods(methods, runner, now = () => new Date()) {
    if (!hasFamily(methods, 'chat'))
        return { methods, warnings: [] };
    const end = now();
    const begin = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    try {
        await runner.run({
            path: ['chat', 'groups', 'list'],
            body: { begin_time: timestamp(begin), end_time: timestamp(end) },
        });
        return { methods, warnings: [] };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'unknown capability probe failure';
        if (error instanceof WeComCliError && error.code === 853006) {
            return {
                methods: methods.filter(method => method.path[0] !== 'chat'),
                warnings: [`chat: ${message}`],
            };
        }
        return { methods, warnings: [`chat: ${message}`] };
    }
}

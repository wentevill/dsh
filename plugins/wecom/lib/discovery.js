function object(value, label) {
    if (value === null || Array.isArray(value) || typeof value !== 'object')
        throw new Error(`${label} must be an object`);
    return value;
}
function ref(value, required) {
    if (value === undefined && !required)
        return undefined;
    const record = object(value, 'schema reference');
    if (typeof record.$ref !== 'string' || record.$ref.length === 0)
        throw new Error('schema reference must contain $ref');
    return record.$ref;
}
/** Expand schema list summaries with schema get for every advertised method. */
export async function discoverWeComMethods(runner) {
    const catalog = (await runner.run({ path: ['schema', 'list'] })).value;
    if (!Array.isArray(catalog))
        throw new Error('wecom-cli schema list must return an array');
    const methods = [];
    for (const serviceValue of catalog) {
        const service = object(serviceValue, 'service catalog entry');
        if (typeof service.name !== 'string' || !Array.isArray(service.methods))
            throw new Error('invalid service catalog entry');
        for (const summaryValue of service.methods) {
            const summary = object(summaryValue, 'method summary');
            if (typeof summary.name !== 'string')
                throw new Error('method summary name must be a string');
            const requestedPath = `${service.name}.${summary.name}`;
            const detail = object((await runner.run({ path: ['schema', 'get', requestedPath] })).value, 'method schema');
            if (detail.method !== requestedPath)
                throw new Error(`method path mismatch: expected ${requestedPath}`);
            const schemasRecord = object(detail.schemas, 'method schemas');
            const schemas = schemasRecord;
            const requestRef = ref(detail.request, false);
            const responseRef = ref(detail.response, true);
            const description = typeof detail.description === 'string'
                ? detail.description
                : typeof summary.description === 'string' ? summary.description : undefined;
            methods.push({
                path: requestedPath.split('.'),
                ...(description === undefined ? {} : { description }),
                ...(requestRef === undefined ? {} : { requestRef }),
                responseRef,
                schemas,
            });
        }
    }
    return methods;
}

import { nextcloudProviderError } from "./errors.js";
import { SHARE_PERMISSIONS } from "./sharing-types.js";
const SHARES = '/ocs/v2.php/apps/files_sharing/api/v1/shares';
const SHAREES = '/ocs/v1.php/apps/files_sharing/api/v1/sharees';
const TARGET_NUMBER = { user: 0, group: 1, publicLink: 3 };
function target(value) {
    const n = Number(value);
    if (n === 0)
        return 'user';
    if (n === 1)
        return 'group';
    if (n === 3)
        return 'publicLink';
    throw new Error('Nextcloud returned an unsupported share type');
}
function profile(permissions, publicUpload) {
    if (permissions === 4 && (publicUpload === true || publicUpload === 'true' || publicUpload === 1))
        return 'fileDrop';
    return permissions === 1 ? 'read' : 'edit';
}
function optionalString(record, ...keys) {
    for (const key of keys)
        if (typeof record[key] === 'string' && record[key] !== '')
            return record[key];
    return undefined;
}
function share(value) {
    if (Array.isArray(value)) {
        if (value.length !== 1)
            throw new Error('Nextcloud returned an invalid share');
        return share(value[0]);
    }
    if (value === null || typeof value !== 'object')
        throw new Error('Nextcloud returned an invalid share');
    const item = value;
    const id = Number(item.id);
    const permissions = Number(item.permissions);
    const path = optionalString(item, 'path', 'file_target');
    if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(permissions) || path === undefined)
        throw new Error('Nextcloud returned an invalid share');
    const shareTarget = target(item.share_type);
    const recipient = optionalString(item, 'share_with');
    return {
        id, path, target: shareTarget, permissions, profile: profile(permissions, item.public_upload),
        ...(recipient === undefined ? {} : { recipient }),
        ...(optionalString(item, 'url') === undefined ? {} : { url: optionalString(item, 'url') }),
        ...(optionalString(item, 'token') === undefined ? {} : { token: optionalString(item, 'token') }),
        ...(optionalString(item, 'expiration', 'expire_date') === undefined ? {} : { expireDate: optionalString(item, 'expiration', 'expire_date') }),
        ...(optionalString(item, 'note') === undefined ? {} : { note: optionalString(item, 'note') }),
        ...(optionalString(item, 'label') === undefined ? {} : { label: optionalString(item, 'label') }),
    };
}
function sharees(value) {
    if (value === null || typeof value !== 'object')
        return [];
    const data = value;
    const result = [];
    const exact = data.exact !== null && typeof data.exact === 'object' ? sharees(data.exact) : [];
    result.push(...exact);
    for (const [key, type] of [['users', 'user'], ['groups', 'group']]) {
        const entries = Array.isArray(data[key]) ? data[key] : [];
        for (const entry of entries) {
            if (entry === null || typeof entry !== 'object')
                continue;
            const item = entry;
            const nested = item.value !== null && typeof item.value === 'object' ? item.value : {};
            const id = optionalString(nested, 'shareWith') ?? optionalString(item, 'value');
            const label = optionalString(item, 'label') ?? id;
            if (id !== undefined && label !== undefined)
                result.push({ id, label, type, category: type === 'user' ? 'person' : 'department' });
        }
    }
    return [...new Map(result.map(item => [`${item.type}:${item.id}`, item])).values()];
}
export class OcsSharingTransport {
    client;
    baseUrl;
    constructor(client, baseUrl) {
        this.client = client;
        this.baseUrl = baseUrl;
    }
    async request(path, method, data, signal) {
        let response;
        try {
            response = await this.client.customRequest(path, {
                method, maxRedirects: 0, signal,
                ...(this.baseUrl === undefined ? {} : { url: `${this.baseUrl.replace(/\/+$/u, '')}${path}` }),
                headers: { 'OCS-APIRequest': 'true', Accept: 'application/json', ...(data === undefined ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }) },
                ...(data === undefined ? {} : { data: data.toString() }),
            });
        }
        catch (error) {
            throw nextcloudProviderError(error);
        }
        if (!response.ok)
            throw Object.assign(new Error('Nextcloud OCS request failed'), { status: response.status });
        let payload;
        try {
            payload = JSON.parse(await response.text());
        }
        catch {
            throw Object.assign(new Error('Nextcloud returned invalid OCS JSON'), { code: 'NEXTCLOUD_OCS_INVALID' });
        }
        const meta = payload?.ocs?.meta;
        const statusCode = Number(meta?.statuscode);
        if (meta?.status !== 'ok' || (statusCode !== 100 && statusCode !== 200))
            throw Object.assign(new Error(String(meta?.message ?? 'Nextcloud OCS request failed')), { code: `NEXTCLOUD_OCS_${String(meta?.statuscode ?? 'UNKNOWN')}` });
        return payload.ocs.data;
    }
    async listShares(path, signal) {
        const query = new URLSearchParams({ format: 'json' });
        if (path !== undefined)
            query.set('path', path);
        const data = await this.request(`${SHARES}?${query}`, 'GET', undefined, signal);
        return (Array.isArray(data) ? data : data === null || data === undefined ? [] : [data]).map(share);
    }
    async getShare(id, signal) {
        return share(await this.request(`${SHARES}/${id}?format=json`, 'GET', undefined, signal));
    }
    async searchSharees(queryText, limit, signal) {
        const query = new URLSearchParams({ format: 'json', search: queryText, lookup: 'false', perPage: String(limit), itemType: 'file' });
        return sharees(await this.request(`${SHAREES}?${query}`, 'GET', undefined, signal));
    }
    async createShare(input, signal) {
        const form = new URLSearchParams({ format: 'json', path: input.path, shareType: String(TARGET_NUMBER[input.target]), permissions: String(SHARE_PERMISSIONS[input.profile]) });
        if (input.recipient !== undefined)
            form.set('shareWith', input.recipient);
        if (input.profile === 'fileDrop')
            form.set('publicUpload', 'true');
        if (input.password !== undefined)
            form.set('password', input.password);
        if (input.expireDate !== undefined)
            form.set('expireDate', input.expireDate);
        if (input.note !== undefined)
            form.set('note', input.note);
        if (input.label !== undefined)
            form.set('label', input.label);
        return share(await this.request(SHARES, 'POST', form, signal));
    }
    async updateShare(id, input, signal) {
        const updates = [];
        if (input.permissions !== undefined)
            updates.push(['permissions', String(input.permissions)]);
        if (input.publicUpload !== undefined)
            updates.push(['publicUpload', String(input.publicUpload)]);
        if (input.password !== undefined)
            updates.push(['password', input.password]);
        if (input.expireDate !== undefined)
            updates.push(['expireDate', input.expireDate]);
        if (input.note !== undefined)
            updates.push(['note', input.note]);
        for (const [key, value] of updates)
            await this.request(`${SHARES}/${id}`, 'PUT', new URLSearchParams({ format: 'json', [key]: value }), signal);
        return this.getShare(id, signal);
    }
    async deleteShare(id, signal) { await this.request(`${SHARES}/${id}`, 'DELETE', undefined, signal); }
}

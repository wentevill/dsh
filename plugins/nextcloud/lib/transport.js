import { Agent as HttpsAgent } from 'node:https';
import { createClient, parseXML, prepareFileFromProps } from 'webdav';
import { nextcloudProviderError } from "./errors.js";
import { OcsSharingTransport } from "./sharing-transport.js";
function xml(value) {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
function davHref(username, path) {
    const encoded = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return `/files/${encodeURIComponent(username)}${encoded === '/' ? '' : encoded}`;
}
export function buildSearchXml(input) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<d:searchrequest xmlns:d="DAV:">
  <d:basicsearch>
    <d:select><d:prop><d:displayname/><d:resourcetype/><d:getcontentlength/><d:getcontenttype/><d:getlastmodified/><d:getetag/></d:prop></d:select>
    <d:from><d:scope><d:href>${xml(davHref(input.username, input.path))}</d:href><d:depth>infinity</d:depth></d:scope></d:from>
    <d:where><d:like><d:prop><d:displayname/></d:prop><d:literal>${xml(`%${input.query}%`)}</d:literal></d:like></d:where>
    <d:orderby><d:order><d:prop><d:displayname/></d:prop><d:ascending/></d:order></d:orderby>
    <d:limit><d:nresults>${input.limit}</d:nresults></d:limit>
  </d:basicsearch>
</d:searchrequest>`;
}
function entry(stat) {
    return {
        path: stat.filename,
        name: stat.basename,
        type: stat.type,
        size: stat.size,
        modifiedAt: stat.lastmod,
        etag: stat.etag,
        ...(stat.mime === undefined ? {} : { mimeType: stat.mime }),
    };
}
const options = (signal) => ({ maxRedirects: 0, signal });
async function provider(operation) {
    try {
        return await operation();
    }
    catch (error) {
        throw nextcloudProviderError(error);
    }
}
export class NextcloudTransport {
    files;
    dav;
    username;
    sharing;
    constructor(files, dav, username, ocs = dav, ocsBaseUrl) {
        this.files = files;
        this.dav = dav;
        this.username = username;
        this.sharing = new OcsSharingTransport(ocs, ocsBaseUrl);
    }
    async list(path, signal) {
        return (await provider(() => this.files.getDirectoryContents(path, options(signal)))).map(entry);
    }
    async stat(path, signal) {
        return entry(await provider(() => this.files.stat(path, options(signal))));
    }
    async readText(path, signal) {
        const result = await provider(() => this.files.getFileContents(path, { format: 'text', ...options(signal) }));
        if (typeof result !== 'string')
            throw new Error('Nextcloud returned non-text content');
        return result;
    }
    download(path, signal) {
        try {
            return this.files.createReadStream(path, options(signal));
        }
        catch (error) {
            throw nextcloudProviderError(error);
        }
    }
    async upload(path, input, size, overwrite, signal) {
        await provider(() => this.files.putFileContents(path, input, { contentLength: size, overwrite, ...options(signal) }));
    }
    async mkdir(path, signal) {
        await provider(() => this.files.createDirectory(path, { recursive: false, ...options(signal) }));
    }
    async move(source, destination, overwrite, signal) {
        await provider(() => this.files.moveFile(source, destination, { overwrite, ...options(signal) }));
    }
    async delete(path, signal) {
        await provider(() => this.files.deleteFile(path, options(signal)));
    }
    searchRequest(input, signal) {
        return this.dav.customRequest('/', {
            method: 'SEARCH',
            headers: { 'Content-Type': 'text/xml; charset=utf-8' },
            data: buildSearchXml({ ...input, username: this.username }),
            ...options(signal),
        });
    }
    async search(input, signal) {
        const response = await provider(() => this.searchRequest(input, signal));
        if (!response.ok)
            throw Object.assign(new Error('Nextcloud SEARCH failed'), { status: response.status });
        const parsed = await parseXML(await response.text());
        const prefix = `/files/${encodeURIComponent(this.username)}`;
        const results = [];
        for (const item of parsed.multistatus?.response ?? []) {
            if (typeof item.href !== 'string' || item.propstat?.prop === undefined)
                continue;
            const prefixAt = item.href.indexOf(prefix);
            if (prefixAt < 0)
                continue;
            const encodedPath = item.href.slice(prefixAt + prefix.length) || '/';
            const path = encodedPath.split('/').map(segment => decodeURIComponent(segment)).join('/');
            const stat = prepareFileFromProps(item.propstat.prop, path);
            results.push(entry(stat));
        }
        return results;
    }
}
/** Create authenticated clients rooted at user files, DAV SEARCH, and the server OCS API. */
export function createNextcloudTransport(settings, password, factory = createClient) {
    const clientOptions = {
        username: settings.username,
        password,
        httpsAgent: new HttpsAgent({ rejectUnauthorized: !settings.skipTlsVerify }),
        entityDecoder: { limit: { maxTotalExpansions: 1_000, maxExpandedLength: 1_000_000 } },
    };
    const files = factory(settings.davUrl, clientOptions);
    const dav = factory(`${settings.serverUrl}/remote.php/dav`, clientOptions);
    const ocs = factory(settings.serverUrl, clientOptions);
    return new NextcloudTransport(files, dav, settings.username, ocs, settings.serverUrl);
}

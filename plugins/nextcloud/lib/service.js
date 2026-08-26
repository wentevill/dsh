import { createReadStream } from 'node:fs';
import { createPathPolicy } from "./path-policy.js";
import { downloadIntoWorkspace, snapshotWorkspaceFile } from "./workspace.js";
const AUTO_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const DEFAULT_TEXT_CHARS = 50_000;
const MAX_TEXT_CHARS = 200_000;
const MAX_RESULTS = 100;
function bounded(value, fallback, max, label) {
    const result = value ?? fallback;
    if (!Number.isSafeInteger(result) || result < 1 || result > max)
        throw new Error(`${label} must be between 1 and ${max}`);
    return result;
}
function inlineText(mimeType) {
    return mimeType?.startsWith('text/') === true || [
        'application/json', 'application/xml', 'application/javascript', 'application/yaml', 'application/x-yaml',
    ].includes(mimeType ?? '');
}
export class NextcloudFileService {
    transport;
    policy;
    defaultPath;
    constructor(transport, settings) {
        this.transport = transport;
        this.policy = createPathPolicy(settings);
        this.defaultPath = settings.accessMode === 'allowlist' ? this.policy.roots[0] : '/';
    }
    async list(path, limitInput, signal) {
        const remotePath = this.policy.assertAllowed(path ?? this.defaultPath);
        const limit = bounded(limitInput, MAX_RESULTS, MAX_RESULTS, 'limit');
        const entries = await this.transport.list(remotePath, signal);
        return { entries: entries.slice(0, limit), truncated: entries.length > limit };
    }
    stat(path, signal) {
        return this.transport.stat(this.policy.assertAllowed(path), signal);
    }
    async search(input, signal) {
        if (typeof input.query !== 'string' || input.query.trim().length === 0)
            throw new Error('search query is required');
        const path = this.policy.assertAllowed(input.path ?? this.defaultPath);
        const limit = bounded(input.limit, MAX_RESULTS, MAX_RESULTS, 'limit');
        const entries = await this.transport.search({ path, query: input.query, limit: limit + 1 }, signal);
        return { entries: entries.slice(0, limit), truncated: entries.length > limit };
    }
    validateUploadPath(path) { return this.policy.assertAllowed(path); }
    validateMovePaths(source, destination) { return this.policy.assertMove(source, destination); }
    validateDeletePath(path) { return this.policy.assertDeletable(path); }
    async read(pathInput, options = {}) {
        const path = this.policy.assertAllowed(pathInput);
        const metadata = await this.transport.stat(path, options.signal);
        if (metadata.type !== 'file')
            throw new Error('Nextcloud path is not a file');
        if (metadata.size > AUTO_DOWNLOAD_BYTES || !inlineText(metadata.mimeType)) {
            if (options.workspace === undefined)
                throw new Error('session workspace is required to download this file');
            const localPath = await downloadIntoWorkspace(options.workspace, path, this.transport.download(path, options.signal), undefined, options.signal);
            return { kind: 'download', remotePath: path, localPath, size: metadata.size, ...(metadata.mimeType === undefined ? {} : { mimeType: metadata.mimeType }) };
        }
        const offset = options.offsetChars ?? 0;
        if (!Number.isSafeInteger(offset) || offset < 0)
            throw new Error('offsetChars must be a non-negative integer');
        const maxChars = bounded(options.maxChars, DEFAULT_TEXT_CHARS, MAX_TEXT_CHARS, 'maxChars');
        const text = await this.transport.readText(path, options.signal);
        const end = Math.min(text.length, offset + maxChars);
        return { kind: 'text', path, text: text.slice(offset, end), nextOffsetChars: end < text.length ? end : null, truncated: end < text.length };
    }
    async download(workspace, pathInput, localPath, signal) {
        const path = this.policy.assertAllowed(pathInput);
        const metadata = await this.transport.stat(path, signal);
        if (metadata.type !== 'file')
            throw new Error('Nextcloud path is not a file');
        const stored = await downloadIntoWorkspace(workspace, path, this.transport.download(path, signal), localPath, signal);
        return { remotePath: path, localPath: stored, size: metadata.size };
    }
    async upload(workspace, localPath, remotePathInput, overwrite, signal) {
        const remotePath = this.validateUploadPath(remotePathInput);
        const snapshot = await snapshotWorkspaceFile(workspace, localPath, signal);
        await this.transport.upload(remotePath, createReadStream(snapshot.path, { signal }), snapshot.size, overwrite, signal);
        return { remotePath, size: snapshot.size, sha256: snapshot.sha256 };
    }
    async mkdir(path, signal) {
        await this.transport.mkdir(this.policy.assertAllowed(path), signal);
    }
    async move(source, destination, overwrite, signal) {
        const paths = this.validateMovePaths(source, destination);
        await this.transport.move(paths.source, paths.destination, overwrite, signal);
    }
    async delete(path, signal) {
        await this.transport.delete(this.validateDeletePath(path), signal);
    }
}

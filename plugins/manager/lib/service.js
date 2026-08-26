import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';
import { mkdir, open, rm } from 'node:fs/promises';
import { inspectPluginArchive } from "./archive.js";
import { PluginManagerError } from "./errors.js";
import { findManagedPlugin, MANAGER_PACKAGE_NAME, readManagedPlugins } from "./profile.js";
import { classifyInstallAction } from "./version.js";
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_CHUNK_BYTES = 1024 * 1024;
export class PluginManagerService {
    options;
    session;
    operating = false;
    constructor(options) {
        this.options = options;
    }
    list() {
        return readManagedPlugins(this.options.profileDir);
    }
    async begin(request) {
        if (this.session !== undefined || this.operating)
            throw new PluginManagerError('OPERATION_BUSY', 'another plugin operation is active');
        if (basename(request.fileName) !== request.fileName || !request.fileName.toLowerCase().endsWith('.tgz')
            || !Number.isSafeInteger(request.size) || request.size <= 0 || request.size > MAX_UPLOAD_BYTES) {
            throw new PluginManagerError('UPLOAD_INVALID', 'select one supported .tgz package');
        }
        await mkdir(this.options.uploadRoot, { recursive: true, mode: 0o700 });
        const id = randomUUID();
        const path = join(this.options.uploadRoot, `${id}.tgz`);
        const handle = await open(path, 'wx', 0o600);
        this.session = { id, path, size: request.size, handle, index: 0, received: 0, closed: false };
        return { uploadId: id, chunkSize: MAX_CHUNK_BYTES };
    }
    async append(request) {
        const session = this.requireSession(request.uploadId);
        if (!Number.isSafeInteger(request.index) || request.index !== session.index
            || request.bytes.byteLength === 0 || request.bytes.byteLength > MAX_CHUNK_BYTES
            || session.received + request.bytes.byteLength > session.size) {
            throw new PluginManagerError('UPLOAD_SEQUENCE_INVALID', 'upload chunks must be sequential and bounded');
        }
        await session.handle.write(request.bytes);
        session.received += request.bytes.byteLength;
        session.index += 1;
        return { received: session.received, size: session.size };
    }
    async finish(request, signal) {
        const session = this.requireSession(request.uploadId);
        if (session.received !== session.size)
            throw new PluginManagerError('UPLOAD_SEQUENCE_INVALID', 'upload is incomplete');
        this.operating = true;
        let retainArchive = false;
        try {
            await this.close(session);
            const candidate = await inspectPluginArchive(session.path);
            if (candidate.packageName === MANAGER_PACKAGE_NAME) {
                throw new PluginManagerError('MANAGER_PROTECTED', 'the plugin manager is updated with Desktop');
            }
            const installed = await findManagedPlugin(this.options.profileDir, candidate.packageName);
            const action = classifyInstallAction(installed?.version, candidate.version);
            if (action === 'downgrade') {
                throw new PluginManagerError('DOWNGRADE_BLOCKED', 'plugin downgrades are not supported');
            }
            await this.options.cli.install(session.path, signal);
            retainArchive = true;
            return {
                action,
                packageName: candidate.packageName,
                version: candidate.version,
                requiresRestart: true,
            };
        }
        finally {
            if (retainArchive) {
                if (this.session === session)
                    this.session = undefined;
            }
            else {
                await this.cleanup(session);
            }
            this.operating = false;
        }
    }
    async cancel(request) {
        const session = this.requireSession(request.uploadId);
        await this.cleanup(session);
        return { cancelled: true };
    }
    async uninstall(request, signal) {
        if (this.session !== undefined || this.operating)
            throw new PluginManagerError('OPERATION_BUSY', 'another plugin operation is active');
        if (request.packageName === MANAGER_PACKAGE_NAME) {
            throw new PluginManagerError('MANAGER_PROTECTED', 'the plugin manager cannot uninstall itself');
        }
        this.operating = true;
        try {
            const installed = await findManagedPlugin(this.options.profileDir, request.packageName);
            if (installed === undefined || !installed.canUninstall) {
                throw new PluginManagerError('PLUGIN_NOT_FOUND', 'plugin is not an uninstallable profile dependency');
            }
            if (installed.version !== request.expectedVersion) {
                throw new PluginManagerError('PLUGIN_STATE_CHANGED', 'plugin version changed; refresh and try again');
            }
            await this.options.cli.uninstall(installed.packageName, signal);
            return { packageName: installed.packageName, version: installed.version, requiresRestart: true };
        }
        finally {
            this.operating = false;
        }
    }
    async dispose() {
        if (this.session !== undefined)
            await this.cleanup(this.session);
    }
    requireSession(uploadId) {
        if (this.session?.id !== uploadId)
            throw new PluginManagerError('UPLOAD_NOT_FOUND', 'upload session is unavailable');
        return this.session;
    }
    async close(session) {
        if (session.closed)
            return;
        session.closed = true;
        await session.handle.close();
    }
    async cleanup(session) {
        try {
            await this.close(session);
        }
        finally {
            await rm(session.path, { force: true });
            if (this.session === session)
                this.session = undefined;
        }
    }
}

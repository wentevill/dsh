import { execFile } from 'node:child_process';
import { open, realpath, stat } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { lookup } from 'mime-types';
const MEBIBYTE = 1024 * 1024;
const TEST_HOOKS_KEY = Symbol.for('dsh-mail.attachment-loader.test-hooks');
const execFileAsync = promisify(execFile);
/** Limits for workspace files accepted by the mail send operation. */
export const DEFAULT_ATTACHMENT_LIMITS = Object.freeze({
    maxFiles: 10,
    maxFileBytes: 10 * MEBIBYTE,
    maxTotalBytes: 25 * MEBIBYTE,
});
class MailAttachmentError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'MailAttachmentError';
    }
}
function attachmentError(code, message) {
    return new MailAttachmentError(code, message);
}
function testHooks() {
    return globalThis[TEST_HOOKS_KEY];
}
function throwIfAborted(signal) {
    if (signal?.aborted)
        throw signal.reason;
}
function isInsideWorkspace(workspace, target) {
    const pathFromWorkspace = relative(workspace, target);
    return pathFromWorkspace !== '..'
        && !pathFromWorkspace.startsWith(`..${sep}`)
        && !isAbsolute(pathFromWorkspace);
}
function snapshotRequest(request) {
    const path = request.path;
    const filename = request.filename;
    const contentType = request.contentType;
    return {
        path,
        ...(filename === undefined ? {} : { filename }),
        ...(contentType === undefined ? {} : { contentType }),
    };
}
function filenameFor(request, target) {
    const filename = request.filename ?? basename(target);
    if (filename.length === 0
        || filename.trim().length === 0
        || filename.length > 255
        || filename === '.'
        || filename === '..'
        || /[\\/\0\r\n]/u.test(filename)) {
        throw attachmentError('MAIL_ATTACHMENT_INVALID_FILENAME', 'Attachment filename must be a safe non-empty basename');
    }
    return filename;
}
function contentTypeFor(request, filename) {
    if (request.contentType === undefined)
        return lookup(filename) || 'application/octet-stream';
    if (request.contentType.trim().length === 0 || /[\r\n]/u.test(request.contentType)) {
        throw attachmentError('MAIL_ATTACHMENT_INVALID_CONTENT_TYPE', 'Attachment content type must be a non-empty single line');
    }
    return request.contentType;
}
async function canonicalWorkspace(workspace, signal) {
    throwIfAborted(signal);
    try {
        const canonical = await realpath(workspace);
        throwIfAborted(signal);
        if (!(await stat(canonical)).isDirectory()) {
            throw attachmentError('MAIL_ATTACHMENT_WORKSPACE_UNAVAILABLE', 'Attachment workspace is not a directory');
        }
        return canonical;
    }
    catch (error) {
        if (error instanceof MailAttachmentError)
            throw error;
        throwIfAborted(signal);
        throw attachmentError('MAIL_ATTACHMENT_WORKSPACE_UNAVAILABLE', 'Attachment workspace is unavailable');
    }
}
async function descriptorLinkTarget(handle) {
    for (const directory of ['/proc/self/fd', '/dev/fd']) {
        try {
            const target = await realpath(`${directory}/${handle.fd}`);
            if (!target.startsWith('/dev/fd/'))
                return target;
        }
        catch {
            // Try the next platform fd namespace.
        }
    }
    if (process.platform === 'darwin') {
        try {
            const { stdout } = await execFileAsync('/usr/sbin/lsof', [
                '-Fn', '-a', '-p', String(process.pid), '-d', String(handle.fd),
            ], { encoding: 'utf8' });
            const entry = stdout.split('\n').find(line => line.startsWith('n'));
            if (entry !== undefined && entry.length > 1)
                return entry.slice(1);
        }
        catch {
            // The descriptor path is unavailable; the caller fails closed below.
        }
    }
    throw attachmentError('MAIL_ATTACHMENT_CHANGED', 'Cannot resolve the opened attachment descriptor path');
}
async function canonicalDescriptorPath(handle) {
    try {
        return await realpath(await descriptorLinkTarget(handle));
    }
    catch (error) {
        if (error instanceof MailAttachmentError)
            throw error;
        throw attachmentError('MAIL_ATTACHMENT_CHANGED', 'Cannot canonicalize the opened attachment descriptor path');
    }
}
async function readAttachment(handle, signal) {
    throwIfAborted(signal);
    const content = signal === undefined ? await handle.readFile() : await handle.readFile({ signal });
    throwIfAborted(signal);
    return content;
}
async function closeAll(handles, afterClose) {
    await Promise.allSettled(handles.map(async ({ handle, path }) => {
        try {
            await handle.close();
        }
        finally {
            await afterClose?.(path);
        }
    }));
}
/**
 * Loads only regular files canonically contained by a session workspace.
 * It validates containment from the opened descriptor before reading that handle.
 */
export async function loadAttachments(requests, workspace, limits = DEFAULT_ATTACHMENT_LIMITS, signal) {
    const snapshots = requests.map(snapshotRequest);
    throwIfAborted(signal);
    if (snapshots.length > limits.maxFiles) {
        throw attachmentError('MAIL_ATTACHMENT_LIMIT_EXCEEDED', 'Too many attachments');
    }
    const canonical = await canonicalWorkspace(workspace, signal);
    const validated = [];
    const handles = [];
    let declaredTotal = 0;
    const hooks = testHooks();
    try {
        for (const request of snapshots) {
            throwIfAborted(signal);
            const candidate = isAbsolute(request.path)
                ? resolve(request.path)
                : resolve(canonical, request.path);
            let target;
            try {
                target = await realpath(candidate);
            }
            catch {
                throwIfAborted(signal);
                throw attachmentError('MAIL_ATTACHMENT_NOT_REGULAR', 'Attachment file is unavailable');
            }
            throwIfAborted(signal);
            if (!isInsideWorkspace(canonical, target)) {
                throw attachmentError('MAIL_ATTACHMENT_OUTSIDE_WORKSPACE', 'Attachment file is outside the workspace');
            }
            const filename = filenameFor(request, target);
            const contentType = contentTypeFor(request, filename);
            await hooks?.beforePathStat?.(target);
            throwIfAborted(signal);
            let pathMetadata;
            try {
                pathMetadata = await stat(target);
            }
            catch {
                throwIfAborted(signal);
                throw attachmentError('MAIL_ATTACHMENT_NOT_REGULAR', 'Attachment file is unavailable');
            }
            throwIfAborted(signal);
            if (!pathMetadata.isFile()) {
                throw attachmentError('MAIL_ATTACHMENT_NOT_REGULAR', 'Attachment must be a regular file');
            }
            if (pathMetadata.size > limits.maxFileBytes) {
                throw attachmentError('MAIL_ATTACHMENT_TOO_LARGE', 'Attachment file exceeds the size limit');
            }
            await hooks?.beforeOpen?.(target);
            throwIfAborted(signal);
            let handle;
            try {
                handle = await open(target, 'r');
            }
            catch {
                throwIfAborted(signal);
                throw attachmentError('MAIL_ATTACHMENT_NOT_REGULAR', 'Attachment file is unavailable');
            }
            handles.push({ handle, path: target });
            await hooks?.afterOpen?.(target);
            throwIfAborted(signal);
            const handleMetadata = await handle.stat();
            throwIfAborted(signal);
            if (!handleMetadata.isFile()) {
                throw attachmentError('MAIL_ATTACHMENT_NOT_REGULAR', 'Attachment must be a regular file');
            }
            if (handleMetadata.size > limits.maxFileBytes) {
                throw attachmentError('MAIL_ATTACHMENT_TOO_LARGE', 'Attachment file exceeds the size limit');
            }
            const descriptorPath = await canonicalDescriptorPath(handle);
            throwIfAborted(signal);
            if (!isInsideWorkspace(canonical, descriptorPath)) {
                throw attachmentError('MAIL_ATTACHMENT_OUTSIDE_WORKSPACE', 'Opened attachment descriptor is outside the workspace');
            }
            const descriptorMetadata = await stat(descriptorPath);
            if (descriptorMetadata.dev !== handleMetadata.dev || descriptorMetadata.ino !== handleMetadata.ino) {
                throw attachmentError('MAIL_ATTACHMENT_CHANGED', 'Attachment descriptor identity cannot be verified');
            }
            if (pathMetadata.dev !== handleMetadata.dev || pathMetadata.ino !== handleMetadata.ino) {
                throw attachmentError('MAIL_ATTACHMENT_CHANGED', 'Attachment file changed before it could be opened');
            }
            declaredTotal += handleMetadata.size;
            if (declaredTotal > limits.maxTotalBytes) {
                throw attachmentError('MAIL_ATTACHMENT_TOO_LARGE', 'Attachments exceed the total size limit');
            }
            validated.push({ handle, filename, contentType, size: handleMetadata.size });
            await hooks?.afterMetadata?.(target);
            throwIfAborted(signal);
        }
        const loaded = [];
        let actualTotal = 0;
        for (const attachment of validated) {
            const content = await readAttachment(attachment.handle, signal);
            const actualSize = content.length;
            if (actualSize > limits.maxFileBytes) {
                throw attachmentError('MAIL_ATTACHMENT_TOO_LARGE', 'Attachment file exceeds the size limit while reading');
            }
            actualTotal += actualSize;
            if (actualTotal > limits.maxTotalBytes) {
                throw attachmentError('MAIL_ATTACHMENT_TOO_LARGE', 'Attachments exceed the total size limit while reading');
            }
            if (actualSize !== attachment.size) {
                throw attachmentError('MAIL_ATTACHMENT_CHANGED', 'Attachment file changed while reading');
            }
            loaded.push({
                filename: attachment.filename,
                contentType: attachment.contentType,
                content,
                size: actualSize,
            });
        }
        return loaded;
    }
    finally {
        await closeAll(handles, hooks?.afterClose);
    }
}

import { createHmac } from 'node:crypto';
export class RoomSessionStore {
    #pending = new Map();
    #table;
    #salt;
    #sessionExists;
    #createSessionId;
    #now;
    #closed = false;
    #closing;
    constructor(options) {
        this.#table = options.table;
        this.#salt = new Uint8Array(options.salt);
        this.#sessionExists = options.sessionExists;
        this.#createSessionId = options.createSessionId;
        this.#now = options.now ?? Date.now;
        if (this.#salt.byteLength < 16)
            throw new TypeError('room-key salt must contain at least 16 bytes');
    }
    resolve(room) {
        if (this.#closed)
            return Promise.reject(new Error('room session store is closed'));
        const key = this.#roomDigest(room);
        const existing = this.#pending.get(key);
        if (existing)
            return existing;
        const operation = this.#resolve(key, room);
        this.#pending.set(key, operation);
        void operation.finally(() => this.#pending.delete(key)).catch(() => { });
        return operation;
    }
    close() {
        this.#closed = true;
        this.#closing ??= Promise.allSettled([...this.#pending.values()]).then(() => undefined);
        return this.#closing;
    }
    async #resolve(key, room) {
        const record = this.#table.get(key);
        const now = this.#now();
        if (record && await this.#sessionExists(record.sessionId)) {
            if (record.lastUsedAt !== now) {
                await this.#table.update(key, current => ({ ...current, lastUsedAt: now }));
            }
            return record.sessionId;
        }
        const sessionId = await this.#createSessionId();
        const replacement = {
            botDigest: this.#digest(`bot\0${room.botId}`),
            kind: room.kind,
            sessionId,
            createdAt: now,
            lastUsedAt: now,
        };
        await this.#table.put(key, replacement);
        return sessionId;
    }
    #roomDigest(room) {
        return this.#digest(`room\0${room.botId}\0${room.kind}\0${room.id}`);
    }
    #digest(value) {
        return createHmac('sha256', this.#salt).update(value, 'utf8').digest('base64url');
    }
}

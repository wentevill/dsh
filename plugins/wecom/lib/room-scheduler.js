export class RoomSchedulerError extends Error {
    code;
    constructor(code) {
        super(`WeCom room scheduler: ${code}`);
        this.code = code;
        this.name = 'RoomSchedulerError';
    }
}
export class RoomScheduler {
    #queues = new Map();
    #ready = [];
    #activeRooms = new Set();
    #idleWaiters = new Set();
    #concurrency;
    #perRoomCapacity;
    #active = 0;
    #closed = false;
    constructor(options = {}) {
        this.#concurrency = options.concurrency ?? 4;
        this.#perRoomCapacity = options.perRoomCapacity ?? 8;
        if (!Number.isInteger(this.#concurrency) || this.#concurrency < 1)
            throw new TypeError('concurrency must be positive');
        if (!Number.isInteger(this.#perRoomCapacity) || this.#perRoomCapacity < 1)
            throw new TypeError('perRoomCapacity must be positive');
    }
    enqueue(roomKey, run) {
        if (this.#closed)
            return Promise.reject(new RoomSchedulerError('closed'));
        const queue = this.#queues.get(roomKey) ?? [];
        const occupied = queue.length + (this.#activeRooms.has(roomKey) ? 1 : 0);
        if (occupied >= this.#perRoomCapacity)
            return Promise.reject(new RoomSchedulerError('room-full'));
        const result = new Promise((resolve, reject) => {
            queue.push({ run, resolve, reject });
        });
        this.#queues.set(roomKey, queue);
        if (!this.#activeRooms.has(roomKey) && queue.length === 1)
            this.#ready.push(roomKey);
        this.#pump();
        return result;
    }
    abort() {
        this.#closed = true;
        const error = new RoomSchedulerError('aborted');
        for (const [room, queue] of this.#queues) {
            if (this.#activeRooms.has(room)) {
                for (const entry of queue.splice(0))
                    entry.reject(error);
            }
            else {
                for (const entry of queue)
                    entry.reject(error);
                this.#queues.delete(room);
            }
        }
        this.#ready.length = 0;
        this.#notifyIdle();
    }
    async drain(timeoutMs) {
        this.#closed = true;
        if (this.#isIdle())
            return;
        let timer;
        let waiter;
        const idle = new Promise(resolve => {
            waiter = resolve;
            this.#idleWaiters.add(resolve);
        });
        const timeout = timeoutMs === undefined
            ? undefined
            : new Promise((_, reject) => {
                timer = setTimeout(() => reject(new RoomSchedulerError('drain-timeout')), timeoutMs);
            });
        try {
            await (timeout ? Promise.race([idle, timeout]) : idle);
        }
        finally {
            if (timer)
                clearTimeout(timer);
            if (waiter)
                this.#idleWaiters.delete(waiter);
        }
    }
    #pump() {
        while (this.#active < this.#concurrency && this.#ready.length > 0) {
            const room = this.#ready.shift();
            if (this.#activeRooms.has(room))
                continue;
            const queue = this.#queues.get(room);
            const entry = queue?.shift();
            if (!entry) {
                this.#queues.delete(room);
                continue;
            }
            this.#active += 1;
            this.#activeRooms.add(room);
            void entry.run().then(entry.resolve, entry.reject).finally(() => {
                this.#active -= 1;
                this.#activeRooms.delete(room);
                const remaining = this.#queues.get(room);
                if (remaining?.length)
                    this.#ready.push(room);
                else
                    this.#queues.delete(room);
                this.#pump();
                this.#notifyIdle();
            });
        }
    }
    #isIdle() { return this.#active === 0 && this.#queues.size === 0; }
    #notifyIdle() {
        if (!this.#isIdle())
            return;
        for (const resolve of this.#idleWaiters)
            resolve();
        this.#idleWaiters.clear();
    }
}

var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { CronId } from "./brand.js";
/** Browser Remote facade; every operation delegates Workspace authorization to commands. */
let CronRemote = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _list_decorators;
    let _history_decorators;
    let _create_decorators;
    let _update_decorators;
    let _pause_decorators;
    let _resume_decorators;
    let _delete_decorators;
    return class CronRemote extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _list_decorators = [Remote('list')];
            _history_decorators = [Remote('history')];
            _create_decorators = [Remote('create')];
            _update_decorators = [Remote('update')];
            _pause_decorators = [Remote('pause')];
            _resume_decorators = [Remote('resume')];
            _delete_decorators = [Remote('delete')];
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _history_decorators, { kind: "method", name: "history", static: false, private: false, access: { has: obj => "history" in obj, get: obj => obj.history }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: obj => "update" in obj, get: obj => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _pause_decorators, { kind: "method", name: "pause", static: false, private: false, access: { has: obj => "pause" in obj, get: obj => obj.pause }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _resume_decorators, { kind: "method", name: "resume", static: false, private: false, access: { has: obj => "resume" in obj, get: obj => obj.resume }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _delete_decorators, { kind: "method", name: "delete", static: false, private: false, access: { has: obj => "delete" in obj, get: obj => obj.delete }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        commands = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx, commands) {
            super(ctx, 'cron');
            this.commands = commands;
        }
        list(request) {
            return this.commands.list(request.sessionId, request.scope);
        }
        history(request) {
            const { sessionId, cronId, cursor, limit } = request;
            return this.commands.history(sessionId, CronId(cronId), compact({ cursor, limit }));
        }
        create(request) {
            const { sessionId, ...input } = request;
            return this.commands.create(sessionId, input);
        }
        update(request) {
            const { sessionId, cronId, expectedRevision, ...input } = request;
            return this.commands.update(sessionId, CronId(cronId), expectedRevision, input);
        }
        pause(request) {
            return this.commands.pause(request.sessionId, CronId(request.cronId));
        }
        resume(request) {
            return this.commands.resume(request.sessionId, CronId(request.cronId));
        }
        delete(request) {
            return this.commands.delete(request.sessionId, CronId(request.cronId));
        }
    };
})();
export { CronRemote };
function compact(value) {
    return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined));
}

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
import { join } from 'node:path';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { PluginCli } from "./cli.js";
import { PluginManagerError } from "./errors.js";
import { resolvePrivateRuntime } from "./runtime.js";
import { PluginManagerService } from "./service.js";
function decodeChunk(value) {
    if (value.length === 0 || value.length > 2 * 1024 * 1024) {
        throw new PluginManagerError('UPLOAD_INVALID', 'upload chunk encoding is invalid');
    }
    const bytes = Buffer.from(value, 'base64');
    const canonical = bytes.toString('base64').replace(/=+$/u, '');
    if (canonical !== value.replace(/=+$/u, '')) {
        throw new PluginManagerError('UPLOAD_INVALID', 'upload chunk encoding is invalid');
    }
    return bytes;
}
let PluginManagerRemote = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _list_decorators;
    let _begin_decorators;
    let _append_decorators;
    let _finish_decorators;
    let _cancel_decorators;
    let _uninstall_decorators;
    return class PluginManagerRemote extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _list_decorators = [Remote('list')];
            _begin_decorators = [Remote('begin')];
            _append_decorators = [Remote('append')];
            _finish_decorators = [Remote('finish')];
            _cancel_decorators = [Remote('cancel')];
            _uninstall_decorators = [Remote('uninstall')];
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _begin_decorators, { kind: "method", name: "begin", static: false, private: false, access: { has: obj => "begin" in obj, get: obj => obj.begin }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _append_decorators, { kind: "method", name: "append", static: false, private: false, access: { has: obj => "append" in obj, get: obj => obj.append }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _finish_decorators, { kind: "method", name: "finish", static: false, private: false, access: { has: obj => "finish" in obj, get: obj => obj.finish }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _cancel_decorators, { kind: "method", name: "cancel", static: false, private: false, access: { has: obj => "cancel" in obj, get: obj => obj.cancel }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _uninstall_decorators, { kind: "method", name: "uninstall", static: false, private: false, access: { has: obj => "uninstall" in obj, get: obj => obj.uninstall }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        manager = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx, manager) {
            super(ctx, 'pluginManager');
            this.manager = manager;
        }
        async list() {
            return { entries: await this.manager.list() };
        }
        begin(request) {
            return this.manager.begin(request);
        }
        append(request) {
            return this.manager.append({
                uploadId: request.uploadId,
                index: request.index,
                bytes: decodeChunk(request.bytesBase64),
            });
        }
        finish(request, signal) {
            return this.manager.finish(request, signal);
        }
        cancel(request) {
            return this.manager.cancel(request);
        }
        uninstall(request, signal) {
            return this.manager.uninstall(request, signal);
        }
    };
})();
export { PluginManagerRemote };
export async function apply(ctx) {
    const runtime = await resolvePrivateRuntime({
        execPath: process.execPath,
        argv1: process.argv[1],
        dshHome: process.env.DSH_HOME,
    });
    const profileDir = join(runtime.dshHome, 'profiles', 'web');
    const uploadRoot = join(runtime.dshHome, '.plugin-manager', 'uploads');
    const manager = new PluginManagerService({ profileDir, uploadRoot, cli: new PluginCli(runtime) });
    new PluginManagerRemote(ctx, manager);
    return async () => { await manager.dispose(); };
}
export { PluginManagerService } from "./service.js";

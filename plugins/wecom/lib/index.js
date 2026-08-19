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
import { createRequire } from 'node:module';
import { arch, platform } from 'node:os';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { deleteOwnedAuthorization } from "./auth-files.js";
import { createAuthRemoteApi } from "./auth-remote.js";
import { createCliAuthBackend } from "./cli-auth-backend.js";
import { createWeComHost } from "./host.js";
import { createRuntimeTool } from "./tool-adapter.js";
import { createGenerationInstaller } from "./generation-installer.js";
import { createNodeProcessExecutor, createWeComProcessRunner } from "./transport.js";
import { waitForFile } from "./qr-file.js";
export const Config = z.object({
    configDir: z.string(),
    profile: z.string().default('web'),
    timeoutMs: z.number().step(1).min(1_000).default(300_000),
    maxOutputBytes: z.number().step(1).min(1_024).default(1_048_576),
});
export const name = 'wecom';
export const inject = ['tools'];
const WECOM_SETTINGS_NAMESPACE = settingsNamespace('wecom');
let WeComAuthRemote = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _status_decorators;
    let _connect_decorators;
    let _cancel_decorators;
    let _refresh_decorators;
    let _deleteAuthorization_decorators;
    return class WeComAuthRemote extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _status_decorators = [Remote('status')];
            _connect_decorators = [Remote('connect')];
            _cancel_decorators = [Remote('cancel')];
            _refresh_decorators = [Remote('refresh')];
            _deleteAuthorization_decorators = [Remote('deleteAuthorization')];
            __esDecorate(this, null, _status_decorators, { kind: "method", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _connect_decorators, { kind: "method", name: "connect", static: false, private: false, access: { has: obj => "connect" in obj, get: obj => obj.connect }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _cancel_decorators, { kind: "method", name: "cancel", static: false, private: false, access: { has: obj => "cancel" in obj, get: obj => obj.cancel }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _refresh_decorators, { kind: "method", name: "refresh", static: false, private: false, access: { has: obj => "refresh" in obj, get: obj => obj.refresh }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _deleteAuthorization_decorators, { kind: "method", name: "deleteAuthorization", static: false, private: false, access: { has: obj => "deleteAuthorization" in obj, get: obj => obj.deleteAuthorization }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        api = __runInitializers(this, _instanceExtraInitializers);
        constructor(ctx, controller) {
            super(ctx, 'wecomAuth');
            this.api = createAuthRemoteApi(controller);
        }
        status() { return this.api.status(); }
        connect() { return this.api.connect(); }
        cancel() { return this.api.cancel(); }
        refresh() { return this.api.refresh(); }
        deleteAuthorization(confirmed) { return this.api.deleteAuthorization(confirmed); }
    };
})();
export { WeComAuthRemote };
function cliExecutable() {
    const require = createRequire(import.meta.url);
    const key = `${platform()}-${arch()}`;
    const packages = {
        'darwin-arm64': '@wecom/cli-darwin-arm64', 'darwin-x64': '@wecom/cli-darwin-x64',
        'linux-arm64': '@wecom/cli-linux-arm64', 'linux-x64': '@wecom/cli-linux-x64',
        'win32-x64': '@wecom/cli-win32-x64',
    };
    const packageName = packages[key];
    if (packageName === undefined)
        throw new Error(`unsupported wecom-cli platform: ${key}`);
    const packagePath = require.resolve(`${packageName}/package.json`);
    return join(dirname(packagePath), 'bin', platform() === 'win32' ? 'wecom-cli.exe' : 'wecom-cli');
}
function profilePath(ctx, config) {
    if (config.configDir !== undefined) {
        if (!isAbsolute(config.configDir))
            throw new Error('WeCom configDir must be absolute');
        const path = resolve(config.configDir);
        if (path === resolve(path, '/'))
            throw new Error('unsafe WeCom configuration directory');
        return path;
    }
    const profile = config.profile ?? 'web';
    if (!/^[a-zA-Z0-9_-]+$/u.test(profile))
        throw new Error('invalid WeCom profile name');
    const resolver = ctx.dshHomePath;
    if (resolver === undefined)
        throw new Error('WeCom requires an absolute configDir outside a profile launch');
    return resolver('profiles', profile, 'plugins', 'wecom');
}
/** Standard Cordis Host entry. Dynamic tools exist only while authorization is valid. */
export async function apply(ctx, config) {
    const configDir = profilePath(ctx, config);
    const tempDir = resolve(configDir, 'tmp');
    const execute = createNodeProcessExecutor();
    const executable = cliExecutable();
    await mkdir(tempDir, { recursive: true });
    const runner = createWeComProcessRunner({
        executable, configDir, tempDir, execute,
        timeoutMs: config.timeoutMs ?? 300_000,
        maxOutputBytes: config.maxOutputBytes ?? 1_048_576,
    });
    const runtimeTools = new Map();
    const installTools = createGenerationInstaller({
        name: definition => definition.name,
        activate: definition => { runtimeTools.set(definition.name, createRuntimeTool(definition.method, runner)); },
        register: definition => {
            const dispose = ctx.tools.register(defineTool({
                name: definition.name,
                description: definition.description,
                parameters: definition.parameters,
                output: {
                    schema: { type: 'json' },
                    render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
                },
                isConcurrencySafe: () => runtimeTools.get(definition.name)?.risk === 'read',
                execute: (args, execution) => {
                    const runtime = runtimeTools.get(definition.name);
                    if (runtime === undefined)
                        throw new Error(`WeCom tool is unavailable: ${definition.name}`);
                    return runtime.execute(args, execution.signal);
                },
            }));
            return () => { dispose(); runtimeTools.delete(definition.name); };
        },
    });
    const host = createWeComHost({
        runner,
        authBackend: createCliAuthBackend({
            executable, configDir, tempDir, execute,
            readQr: waitForFile,
            deleteOwned: () => deleteOwnedAuthorization(configDir, {
                removeFile: path => rm(path, { force: true }),
                removeTree: path => rm(path, { recursive: true, force: true }),
            }),
        }),
        installTools,
    });
    new WeComAuthRemote(ctx, host.auth);
    ctx.inject(['settings'], (settingsCtx) => settingsCtx.settings.register(WECOM_SETTINGS_NAMESPACE, z.object({}), {
        applies: 'live', base: {},
    }));
    ctx.on('tools/pre-execute', async (execution, next) => {
        const runtime = runtimeTools.get(execution.name);
        if (runtime === undefined)
            return next();
        return runtime.preDecision(execution.arguments);
    });
    await host.initialize();
}

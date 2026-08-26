export class PluginManagerError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.code = code;
        this.name = 'PluginManagerError';
    }
}

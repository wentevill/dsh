import { normalizeNextcloudSettings } from "./settings.js";
export function loadNextcloudSettings(scope) {
    return { settings: scope.get() };
}
export async function saveNextcloudSettings(scope, request) {
    const server = request.settings.serverUrl.trim();
    const username = request.settings.username.trim();
    if ((server === '') !== (username === ''))
        throw new Error('Nextcloud requires both server URL and username');
    const settings = server === ''
        ? { ...request.settings, serverUrl: '', username: '', accessMode: 'all', allowedRoots: [] }
        : normalizeNextcloudSettings(request.settings);
    const { davUrl: _davUrl, ...persisted } = settings;
    await scope.replace(persisted);
    return { settings: scope.get() };
}

function settingsError(message) {
    const error = new Error(`confluence: ${message}`);
    error.name = 'ConfluenceSettingsError';
    return error;
}
export function normalizeBaseUrl(value) {
    let url;
    try {
        url = new URL(value.trim());
    }
    catch {
        throw settingsError('Confluence HTTPS base URL is invalid');
    }
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
        throw settingsError('Confluence HTTPS base URL must use HTTPS and contain no credentials, query, or fragment');
    }
    url.pathname = url.pathname.replace(/\/+$/u, '');
    return url.toString().replace(/\/$/u, '');
}
function normalizeSpaceKey(value) {
    const key = value.trim();
    if (key.length === 0 || key.length > 255 || /[\r\n]/u.test(key))
        throw settingsError('space key is invalid');
    return key;
}
export function normalizeConfluenceSettings(value) {
    const seen = new Set();
    const allowedSpaceKeys = value.allowedSpaceKeys.map(normalizeSpaceKey).filter(key => {
        const folded = key.toUpperCase();
        if (seen.has(folded))
            return false;
        seen.add(folded);
        return true;
    });
    if (allowedSpaceKeys.length > 100)
        throw settingsError('space allowlist cannot exceed 100 entries');
    if (value.allowAllSpaces === (allowedSpaceKeys.length > 0)) {
        throw settingsError('choose either all spaces or a non-empty space allowlist');
    }
    return { baseUrl: normalizeBaseUrl(value.baseUrl), allowAllSpaces: value.allowAllSpaces, allowedSpaceKeys };
}
export function spaceAllowed(settings, key) {
    return settings.allowAllSpaces || settings.allowedSpaceKeys.some(value => value.toUpperCase() === key.trim().toUpperCase());
}

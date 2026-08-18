import { assertMailSettingsEndpoints } from "./mail-settings.js";
/** Read the resolved mail section through its owning Host settings scope. */
export function loadMailSettings(scope) {
    return { settings: scope.get() };
}
/** Commit and reread one mail section through its owning Host settings scope. */
export async function saveMailSettings(scope, request) {
    assertMailSettingsEndpoints(request.settings);
    await scope.replace(request.settings);
    return { settings: scope.get() };
}

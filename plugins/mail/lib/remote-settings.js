/** Commit and reread one mail section through its owning Host settings scope. */
export async function saveMailSettings(scope, request) {
    await scope.replace(request.settings);
    return { settings: scope.get() };
}

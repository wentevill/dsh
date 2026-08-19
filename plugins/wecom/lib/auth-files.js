import { isAbsolute, join, parse, resolve } from 'node:path';
/** Delete only wecom-cli authorization material inside a validated plugin directory. */
export async function deleteOwnedAuthorization(configDir, operations) {
    const ownedRoot = resolve(configDir);
    if (!isAbsolute(configDir) || ownedRoot === parse(ownedRoot).root) {
        throw new Error('unsafe WeCom configuration directory');
    }
    await operations.removeFile(join(ownedRoot, 'credentials.enc'));
    await operations.removeFile(join(ownedRoot, '.encryption_key'));
    await operations.removeTree(join(ownedRoot, 'cache'));
}

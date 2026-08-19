import { isAbsolute, join, parse, resolve } from 'node:path'

/** Exact file operations owned by authorization deletion. */
export interface AuthorizationFileOperations {
  readonly removeFile: (path: string) => Promise<void>
  readonly removeTree: (path: string) => Promise<void>
}

/** Delete only wecom-cli authorization material inside a validated plugin directory. */
export async function deleteOwnedAuthorization(
  configDir: string,
  operations: AuthorizationFileOperations,
): Promise<void> {
  const ownedRoot = resolve(configDir)
  if (!isAbsolute(configDir) || ownedRoot === parse(ownedRoot).root) {
    throw new Error('unsafe WeCom configuration directory')
  }
  await operations.removeFile(join(ownedRoot, 'credentials.enc'))
  await operations.removeFile(join(ownedRoot, '.encryption_key'))
  await operations.removeTree(join(ownedRoot, 'cache'))
}

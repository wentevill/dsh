/** Exact file operations owned by authorization deletion. */
export interface AuthorizationFileOperations {
    readonly removeFile: (path: string) => Promise<void>;
    readonly removeTree: (path: string) => Promise<void>;
}
/** Delete only wecom-cli authorization material inside a validated plugin directory. */
export declare function deleteOwnedAuthorization(configDir: string, operations: AuthorizationFileOperations): Promise<void>;

export declare const MANAGER_PACKAGE_NAME = "dsh-plugin-manager";
export interface ManagedPluginEntry {
    readonly packageName: string;
    readonly version: string;
    readonly canUninstall: boolean;
}
export declare function readManagedPlugins(profileDir: string): Promise<ManagedPluginEntry[]>;
export declare function findManagedPlugin(profileDir: string, packageName: string): Promise<ManagedPluginEntry | undefined>;

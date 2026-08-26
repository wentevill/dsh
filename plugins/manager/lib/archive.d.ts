export interface InspectedPlugin {
    readonly digest: string;
    readonly packageName: string;
    readonly version: string;
    readonly bundlePatch: string;
}
export declare function inspectPluginArchive(path: string): Promise<InspectedPlugin>;

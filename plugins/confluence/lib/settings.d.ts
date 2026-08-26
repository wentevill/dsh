export interface ConfluenceSettings {
    baseUrl: string;
    allowAllSpaces: boolean;
    allowedSpaceKeys: string[];
}
export declare function normalizeBaseUrl(value: string): string;
export declare function normalizeConfluenceSettings(value: ConfluenceSettings): ConfluenceSettings;
export declare function spaceAllowed(settings: Pick<ConfluenceSettings, 'allowAllSpaces' | 'allowedSpaceKeys'>, key: string): boolean;

export interface PageCqlInput {
    query: string;
    labels: string[];
    requestedSpaces: string[];
    allowedSpaces: string[];
    allowAllSpaces: boolean;
}
export declare function buildPageCql(input: PageCqlInput): string;

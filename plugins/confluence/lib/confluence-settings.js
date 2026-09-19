import z from '@deepseek-ai/schemastery';
export const CONFLUENCE_SETTINGS_NAMESPACE = 'confluence';
export const ConfluenceSettingsSchema = z.object({
    baseUrl: z.string().default(''),
    allowAllSpaces: z.boolean().default(false),
    allowedSpaceKeys: z.array(z.string()).default([]),
});

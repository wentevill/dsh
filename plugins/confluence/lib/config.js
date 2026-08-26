import z from '@deepseek-ai/schemastery';
export const Config = z.object({
    baseUrl: z.string().default(''),
    allowAllSpaces: z.boolean().default(false),
    allowedSpaceKeys: z.array(z.string()).default([]),
});

import z from '@deepseek-ai/schemastery'
import type { ConfluenceSettings } from './settings.ts'

export interface Config extends ConfluenceSettings {}

export const Config: z<Config> = z.object({
  baseUrl: z.string().default(''),
  allowAllSpaces: z.boolean().default(false),
  allowedSpaceKeys: z.array(z.string()).default([]),
})

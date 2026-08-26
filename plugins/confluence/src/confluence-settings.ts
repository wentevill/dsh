import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { ConfluenceSettings } from './settings.ts'

export const CONFLUENCE_SETTINGS_NAMESPACE = settingsNamespace('confluence')

export const ConfluenceSettingsSchema: z<ConfluenceSettings> = z.object({
  baseUrl: z.string().default(''),
  allowAllSpaces: z.boolean().default(false),
  allowedSpaceKeys: z.array(z.string()).default([]),
})

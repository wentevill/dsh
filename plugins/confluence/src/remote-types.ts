import type { ConfluenceSettings } from './settings.js'

export interface ConfluenceSettingsSaveRequest { settings: ConfluenceSettings }
export interface ConfluenceSettingsSaveResult { settings: ConfluenceSettings; patRef: string }
export interface ConfluenceCredentialRefResult { patRef: string }
export interface ConfluenceConnectionResult {
  ok: true
  version: string
  buildNumber: number
  verifiedSpaces: string[]
}

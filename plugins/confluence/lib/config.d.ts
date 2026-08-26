import z from '@deepseek-ai/schemastery';
import type { ConfluenceSettings } from './settings.ts';
export interface Config extends ConfluenceSettings {
}
export declare const Config: z<Config>;

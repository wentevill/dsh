import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { CronCommandService } from './commands.ts';
type Commands = Pick<CronCommandService, 'create' | 'update' | 'pause' | 'resume' | 'delete' | 'list' | 'history'>;
/** Build the complete model-facing Cron tool set. */
export declare function createCronTools(commands: Commands): readonly ToolDefinition[];
export {};

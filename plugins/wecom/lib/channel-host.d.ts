import type { Context } from '@deepseek-ai/cordis';
import type { AuthBackend } from './auth.js';
import type { CliAuthBackend } from './cli-auth-backend.js';
import { createChannelController } from './channel-state-machine.js';
import type { WeComChannelSnapshot } from './channel-types.js';
import type { QrAuthManager } from './qr-auth-manager.js';
export declare const WECOM_BOT_ID: import("@deepseek-ai/dsh-credentials").CredentialRef;
export declare const WECOM_BOT_SECRET: import("@deepseek-ai/dsh-credentials").CredentialRef;
export declare const WECOM_ROOM_KEY_SALT: import("@deepseek-ai/dsh-credentials").CredentialRef;
export interface WeComChannelHost {
    readonly authBackend: AuthBackend;
    initialize(): Promise<void>;
    snapshot(): WeComChannelSnapshot;
    dispose(): Promise<void>;
}
export declare function createWeComChannelHost(ctx: Context, options: {
    readonly cli: CliAuthBackend;
    readonly qr: QrAuthManager;
    readonly createController?: typeof createChannelController;
}): Promise<WeComChannelHost>;

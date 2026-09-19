import { mountNextcloudDeleteComponent } from "./tools.js";
export const name = 'nextcloud-delete';
export const inject = ['tools', 'nextcloudRuntime'];
export function apply(ctx) {
    mountNextcloudDeleteComponent(ctx);
}

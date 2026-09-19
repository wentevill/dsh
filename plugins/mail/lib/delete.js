import { mountMailDeleteComponent } from "./tools.js";
export const name = 'mail-delete';
export const inject = ['tools', 'mailRuntime'];
export function apply(ctx) {
    mountMailDeleteComponent(ctx);
}

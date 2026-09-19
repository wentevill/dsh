import { mountConfluenceDeleteComponent } from "./tools.js";
export const name = 'confluence-delete';
export const inject = ['tools', 'confluenceRuntime'];
export function apply(ctx) {
    mountConfluenceDeleteComponent(ctx);
}

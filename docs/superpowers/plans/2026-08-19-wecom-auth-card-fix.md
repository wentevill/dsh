# WeCom Authorization Card Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the WeCom settings card bilingual, visibly interactive, and correctly driven by Typert Remote results.

**Architecture:** Separate protocol unwrapping, locale dictionaries, and namespaced CSS into focused client modules. The React card consumes only unwrapped snapshots and localized strings; Host authorization behavior remains unchanged.

**Tech Stack:** TypeScript, React, Cordis client slots/locale, Typert Remote, Vitest, tsdown.

## Global Constraints

- Keep the runtime slot registration as `id: "wecom"`.
- Support complete `zh` and `en` copy through namespace `settings.plugins.wecom`.
- Use only namespaced CSS and Harness `--dsw-alias-*` tokens.
- Release the corrected plugin as `dsh-wecom@0.1.2`.

---

### Task 1: Unwrap Remote authorization results

**Files:**
- Create: `plugins/wecom/src/client/remote-result.ts`
- Create: `plugins/wecom/tests/client-remote-result.spec.ts`
- Modify: `plugins/wecom/src/client/index.tsx`

**Interfaces:**
- Produces: `unwrapAuthResult(response): WeComAuthSnapshot`, throwing the remote message for `{ ok: false }`.

- [ ] Write tests asserting `{ ok: true, value }` returns `value` and `{ ok: false, error }` throws `error.message`.
- [ ] Run `plugins/wecom/node_modules/.bin/vitest run plugins/wecom/tests/client-remote-result.spec.ts` and observe failure because the module is absent.
- [ ] Implement `unwrapAuthResult` and route status/connect/cancel/refresh/delete responses through it; polling errors preserve the prior snapshot and update visible error text.
- [ ] Run the focused test and all `plugins/wecom/tests`; expect green.
- [ ] Commit with `fix(wecom): unwrap authorization remote results`.

### Task 2: Add locale dictionaries and button styling

**Files:**
- Create: `plugins/wecom/src/client/locales.ts`
- Create: `plugins/wecom/src/client/card-css.ts`
- Create: `plugins/wecom/tests/client-locales.spec.ts`
- Modify: `plugins/wecom/src/client/index.tsx`

**Interfaces:**
- Produces: identical-key `zh`/`en` dictionaries and `ensureWeComCardCSS()` plus primary, secondary, danger, actions, card, status, and error classes.

- [ ] Write tests asserting dictionary key parity, English authorization copy, Chinese authorization copy, and exported button classes.
- [ ] Run the focused test and observe failure because locale/style modules are absent.
- [ ] Register `settings.plugins.wecom` with `ctx.locale`, inject `locale`, render all copy through `t`, inject the stylesheet, and apply explicit `type="button"` plus button classes.
- [ ] Run focused tests, all plugin tests, and `npm run build`; expect green.
- [ ] Commit with `fix(wecom): localize and style authorization card`.

### Task 3: Release, install, and verify 0.1.2

**Files:**
- Modify: `plugins/wecom/package.json`
- Modify: `plugins/wecom/README.md`
- Generated: `plugins/wecom/lib/client.js`

**Interfaces:**
- Produces: `plugins/wecom/dsh-wecom-0.1.2.tgz` and Desktop web-profile dependency `dsh-wecom@0.1.2`.

- [ ] Change the package version and README archive example from `0.1.1` to `0.1.2`.
- [ ] Run all plugin tests, root packaging tests, `npm run build`, and `git diff --check`.
- [ ] Run `make install-plugin PLUGIN=wecom PROFILE=web` while the installed app is stopped.
- [ ] Verify the installed package version is `0.1.2`, its client bundle contains localized dictionaries and RemoteResult unwrapping, then briefly boot the Desktop web profile and confirm it reaches `dsh web:` without plugin-load errors.
- [ ] Commit with `fix(wecom): release authorization card fixes`.

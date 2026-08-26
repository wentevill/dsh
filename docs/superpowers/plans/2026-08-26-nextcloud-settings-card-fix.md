# Nextcloud Settings Card Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep unsaved Nextcloud field edits stable and render the settings card in the same visual language as Mail.

**Architecture:** Load Host settings once before slot registration, then keep a local card draft until save. Reuse Mail's self-contained plugin-card markup and design-token CSS without introducing its controller/store layer.

**Tech Stack:** React, TypeScript, Vitest, DSH client slots and remotes.

## Global Constraints

- Do not reload settings from a render effect.
- Keep credentials write-only.
- Preserve all existing Nextcloud settings and connection-test behavior.

---

### Task 1: Stable initial settings

**Files:**
- Modify: `plugins/nextcloud/src/client/index.tsx`
- Test: `plugins/nextcloud/tests/client-load.spec.ts`

**Interfaces:**
- Produces: `loadNextcloudCardSettings(remoteApi): Promise<NextcloudSettings>`

- [ ] Write a test asserting one remote load returns the card's initial settings.
- [ ] Run the focused test and observe failure because the helper does not exist.
- [ ] Move loading out of the React effect and pass the loaded value into the card.
- [ ] Run the focused test and observe it pass.

### Task 2: Mail-style card chrome

**Files:**
- Create: `plugins/nextcloud/src/client/card-css.ts`
- Create: `plugins/nextcloud/src/client/fields.tsx`
- Modify: `plugins/nextcloud/src/client/index.tsx`
- Test: `plugins/nextcloud/tests/client-style.spec.ts`

**Interfaces:**
- Produces: prefixed Nextcloud card and field classes backed by DSH design tokens.

- [ ] Write a test asserting the stylesheet is Nextcloud-prefixed and uses DSH design tokens.
- [ ] Run the focused test and observe failure because the stylesheet does not exist.
- [ ] Implement the collapsible card, field controls, status, discard/save/test footer, and stylesheet following Mail.
- [ ] Run all plugin tests and build the client bundle.

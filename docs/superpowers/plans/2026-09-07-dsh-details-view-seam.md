# DSH Details View Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic keyed route into the existing DSH right details column so independently packaged Client plugins can open a typed, Session-scoped details view without replacing first-party ToolDetails.

**Architecture:** `ui-chat` continues to own the one top-level `details` slot. A new `ConversationDetailsController` stores an optional keyed extension route per Session, opens and closes the existing layout column, and lets `DetailsPanel` render `conversation.details.view` before falling back to the unchanged ToolDetails path. The seam is generic and contains no Cron behavior.

**Tech Stack:** TypeScript 6, React 19, Cordis Client services, DSH keyed slots, Vitest, jsdom.

## Global Constraints

- Execute this plan in a clean upstream DeepSeek Harness worktree, not in the packaging repository's `deepseek-harness-source` checkout.
- Preserve the existing `details` single-slot owner and the existing `conversation.details.tool` fallback.
- The new route state is Session-scoped, JSON-safe, keyed, and contains no Cron-specific types or copy.
- Opening a Tool detail clears any extension route for that Session.
- Closing the details column clears its active extension route.
- Do not change Host APIs, Session persistence, or the three-column layout geometry.
- Run upstream focused Client tests and the normal package/type/catalog verification gates before release.

---

## File Structure

- Create `packages/client/ui-chat/src/client/details/controller.ts`: generic per-Session details-route controller.
- Modify `packages/client/ui-chat/src/client/contract/slots.ts`: route types, service declaration, keyed slot contract, and composed props.
- Modify `packages/client/ui-chat/src/client/apply.ts`: provide the controller and declare the keyed child slot.
- Modify `packages/client/ui-chat/src/client/details/DetailsPanel.tsx`: render an extension route or the existing Tool details body.
- Modify `packages/client/ui-chat/src/client/index.ts`: export the public controller and route types.
- Create `packages/client/ui-chat/tests/details-controller.client.spec.ts`: controller state and lifecycle tests.
- Modify `packages/client/ui-chat/tests/apply-inject.client.spec.tsx`: service provisioning and Tool-selection precedence tests.
- Create `packages/client/ui-chat/tests/details-view-slot.client.spec.tsx`: keyed rendering and fallback tests.
- Regenerate `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`: published slot metadata.

### Task 1: Session-Scoped Details Route Controller

**Files:**
- Create: `packages/client/ui-chat/src/client/details/controller.ts`
- Test: `packages/client/ui-chat/tests/details-controller.client.spec.ts`

**Interfaces:**
- Consumes: `ILayout.openDetails(): void`, `ILayout.closeDetails(): void`, `SessionId`, and `JsonValue`.
- Produces: `ConversationDetailsRoute`, `ConversationDetailsSnapshot`, and `ConversationDetailsController.openExtension()`, `.showTool()`, `.close()`, `.snapshot()`, `.subscribe()`.

- [ ] **Step 1: Write the failing controller tests**

```ts
// packages/client/ui-chat/tests/details-controller.client.spec.ts
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ConversationDetailsController } from '../src/client/details/controller.ts'

const A = 'session-a' as SessionId
const B = 'session-b' as SessionId

describe('ConversationDetailsController', () => {
  it('keeps extension routes isolated by Session and opens the layout', () => {
    const layout = { openDetails: vi.fn(), closeDetails: vi.fn() }
    const details = new ConversationDetailsController(layout)
    details.openExtension(A, { key: 'example', state: { scope: 'related' } })
    expect(details.snapshot(A)).toEqual({ kind: 'extension', key: 'example', state: { scope: 'related' } })
    expect(details.snapshot(B)).toEqual({ kind: 'tool' })
    expect(layout.openDetails).toHaveBeenCalledOnce()
  })

  it('clears an extension before showing ToolDetails or closing', () => {
    const layout = { openDetails: vi.fn(), closeDetails: vi.fn() }
    const details = new ConversationDetailsController(layout)
    details.openExtension(A, { key: 'example', state: null })
    details.showTool(A)
    expect(details.snapshot(A)).toEqual({ kind: 'tool' })
    details.openExtension(A, { key: 'example', state: null })
    details.close(A)
    expect(details.snapshot(A)).toEqual({ kind: 'tool' })
    expect(layout.closeDetails).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run the tests and verify the missing controller fails**

Run:

```bash
corepack pnpm exec vitest run packages/client/ui-chat/tests/details-controller.client.spec.ts
```

Expected: FAIL because `details/controller.ts` does not exist.

- [ ] **Step 3: Implement the minimal controller**

```ts
// packages/client/ui-chat/src/client/details/controller.ts
import type { JsonValue } from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'

export interface ConversationDetailsRoute {
  readonly key: string
  readonly state: JsonValue
}

export type ConversationDetailsSnapshot =
  | { readonly kind: 'tool' }
  | ({ readonly kind: 'extension' } & ConversationDetailsRoute)

export class ConversationDetailsController {
  private readonly routes = new Map<SessionId, ConversationDetailsSnapshot>()
  private readonly listeners = new Map<SessionId, Set<() => void>>()

  constructor(private readonly layout: Pick<ILayout, 'openDetails' | 'closeDetails'>) {}

  openExtension(sessionId: SessionId, route: ConversationDetailsRoute): void {
    if (route.key.trim() === '') throw new TypeError('details route key must be non-empty')
    this.routes.set(sessionId, { kind: 'extension', key: route.key, state: route.state })
    this.emit(sessionId)
    this.layout.openDetails()
  }

  showTool(sessionId: SessionId): void {
    this.routes.delete(sessionId)
    this.emit(sessionId)
    this.layout.openDetails()
  }

  close(sessionId: SessionId): void {
    this.routes.delete(sessionId)
    this.emit(sessionId)
    this.layout.closeDetails()
  }

  snapshot(sessionId: SessionId): ConversationDetailsSnapshot {
    return this.routes.get(sessionId) ?? { kind: 'tool' }
  }

  subscribe(sessionId: SessionId, listener: () => void): () => void {
    const listeners = this.listeners.get(sessionId) ?? new Set<() => void>()
    listeners.add(listener)
    this.listeners.set(sessionId, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.listeners.delete(sessionId)
    }
  }

  private emit(sessionId: SessionId): void {
    for (const listener of this.listeners.get(sessionId) ?? []) listener()
  }
}
```

- [ ] **Step 4: Run the controller tests**

Run:

```bash
corepack pnpm exec vitest run packages/client/ui-chat/tests/details-controller.client.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the controller slice**

```bash
git add packages/client/ui-chat/src/client/details/controller.ts packages/client/ui-chat/tests/details-controller.client.spec.ts
git commit -m "feat(ui-chat): add details route controller"
```

### Task 2: Keyed Details View Slot and Tool Fallback

**Files:**
- Modify: `packages/client/ui-chat/src/client/contract/slots.ts`
- Modify: `packages/client/ui-chat/src/client/details/DetailsPanel.tsx`
- Modify: `packages/client/ui-chat/src/client/apply.ts`
- Modify: `packages/client/ui-chat/tests/apply-inject.client.spec.tsx`
- Create: `packages/client/ui-chat/tests/details-view-slot.client.spec.tsx`

**Interfaces:**
- Consumes: `ConversationDetailsController` from Task 1 and the existing `conversation.details.tool` renderer.
- Produces: keyed slot `conversation.details.view`, `ConversationDetailsViewOwnerProps`, and `DetailsInjected.details`.

- [ ] **Step 1: Add failing slot-contract and render tests**

Add a contract assertion that `conversation.details.view` is declared as a
Session-scoped keyed child of the shipped `details` entry. Render a registered
`example` view and assert its route state reaches the component; then select a
Tool and assert the existing `conversation.details.tool` renderer returns.

```tsx
expect(detailsEntry.children).toMatchObject({
  'conversation.details.tool': { kind: 'single', scope: 'session' },
  'conversation.details.view': { kind: 'keyed', scope: 'session' },
})

controller.openExtension(ROOT, { key: 'example', state: { value: 7 } })
expect(screen.getByText('extension:7')).toBeTruthy()
controller.showTool(ROOT)
expect(screen.getByText('tool-details')).toBeTruthy()
```

- [ ] **Step 2: Run focused tests and verify the missing slot fails**

Run:

```bash
corepack pnpm exec vitest run packages/client/ui-chat/tests/apply-inject.client.spec.tsx packages/client/ui-chat/tests/details-view-slot.client.spec.tsx
```

Expected: FAIL because the keyed slot and controller injection are absent.

- [ ] **Step 3: Add the public slot and injected props**

Add these shapes to `contract/slots.ts` and include the new slot in
`DetailsSlotProps`:

```ts
import type { JsonValue } from '@deepseek-ai/dsh-session'
import type { ConversationDetailsController } from '../details/controller.ts'

export interface ConversationDetailsViewOwnerProps {
  readonly state: JsonValue
  close(): void
}

export interface DetailsInjected {
  closeDetails: () => void
  details: ConversationDetailsController
}

export type DetailsSlotProps =
  PropsRuntime<'details'>
  & PropsRenderSlots<'conversation.details.tool' | 'conversation.details.view'>
  & PropsStore<ChatStore>
  & InjectFace<DetailsInjected>
  & PropsLocale<'chat'>

// In SlotMap:
'conversation.details.view': {
  kind: 'keyed'
  scope: 'session'
  owner: ConversationDetailsViewOwnerProps
}
```

- [ ] **Step 4: Provide the controller and declare the child slot**

In `apply.ts`, construct one controller, provide it as `conversationDetails`,
clear extension state before every existing Tool selection, and declare the
keyed child:

```ts
const details = new ConversationDetailsController(ctx.layout)
ctx.effect(
  () => ctx.reflect.provide('conversationDetails', details),
  'ui-chat: conversation details service',
)

// Existing ChatView injection:
openDetails: (target) => {
  instance.actions.select(target)
  details.showTool(sessionId)
},

ctx.slots.inject('details', () => ctx.slots.register({
  name: 'details',
  locale: NS,
  children: {
    'conversation.details.tool': { kind: 'single', scope: 'session' },
    'conversation.details.view': { kind: 'keyed', scope: 'session' },
  },
  store: chatStore,
  inject: (): DetailsInjected => ({
    details,
    closeDetails: () => { ctx.layout.closeDetails() },
  }),
}, DetailsPanel))
```

`DetailsPanel` already receives the framework-standard `sessionId`; its close
button must call `details.close(sessionId)`. Keep `closeDetails` on the injected
face for compatibility with existing consumers, but do not use it to guess a
Session identity.

- [ ] **Step 5: Render the extension route before the unchanged Tool body**

In `DetailsPanel.tsx`, subscribe to the scoped route and render the keyed entry.
Keep the current header, close button, Tool material lookup, and raw fallback in
their existing functions.

```tsx
const route = useSyncExternalStore(
  listener => details.subscribe(sessionId, listener),
  () => details.snapshot(sessionId),
)

if (route.kind === 'extension') {
  return renderSlot('conversation.details.view', {
    state: route.state,
    close: () => { details.close(sessionId) },
  }, {
    key: route.key,
    fallback: <div className={css.empty}>{t('details.unavailable')}</div>,
  })
}
```

Do not mount ToolDetails behind the extension renderer; switching back to a
Tool route must remount the existing body from its current selection.

- [ ] **Step 6: Run the focused Client tests**

Run:

```bash
corepack pnpm exec vitest run packages/client/ui-chat/tests/details-controller.client.spec.ts packages/client/ui-chat/tests/apply-inject.client.spec.tsx packages/client/ui-chat/tests/details-view-slot.client.spec.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the render slice**

```bash
git add packages/client/ui-chat/src/client/contract/slots.ts packages/client/ui-chat/src/client/details/DetailsPanel.tsx packages/client/ui-chat/src/client/apply.ts packages/client/ui-chat/tests/apply-inject.client.spec.tsx packages/client/ui-chat/tests/details-view-slot.client.spec.tsx
git commit -m "feat(ui-chat): add keyed details views"
```

### Task 3: Public Contract, Catalog, and Upstream Gates

**Files:**
- Modify: `packages/client/ui-chat/src/client/index.ts`
- Modify generated: `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`
- Test: `packages/client/ui-chat/tests/views-type-chain.client.spec.tsx`
- Test: `packages/extensions/cordis-client-runner/tests/slot-catalog.spec.ts`

**Interfaces:**
- Consumes: controller and slot types from Tasks 1-2.
- Produces: public `conversationDetails` Client service declaration and discoverable keyed-slot documentation for external plugins.

- [ ] **Step 1: Add failing public type and catalog assertions**

```ts
// ui-chat type-chain test
ctx.conversationDetails.openExtension(sessionId, {
  key: 'consumer.details',
  state: { selectedId: '42' },
})
ctx.slots.inject('conversation.details.view', () => ctx.slots.register(
  { name: 'conversation.details.view', key: 'consumer.details' },
  props => React.createElement('div', null, String(props.state)),
))
```

Add a catalog assertion that the entry is keyed, Session-scoped, declared by
`ui-chat`, and documents that registration is additive by key rather than a
replacement for the top-level details column.

- [ ] **Step 2: Run the type and catalog tests to verify failure**

Run:

```bash
corepack pnpm exec vitest run packages/client/ui-chat/tests/views-type-chain.client.spec.tsx packages/extensions/cordis-client-runner/tests/slot-catalog.spec.ts
```

Expected: FAIL until the service/types are exported and the catalog regenerated.

- [ ] **Step 3: Export the public contract**

```ts
// packages/client/ui-chat/src/client/index.ts
export { ConversationDetailsController } from './details/controller.ts'
export type {
  ConversationDetailsRoute,
  ConversationDetailsSnapshot,
} from './details/controller.ts'
export type { ConversationDetailsViewOwnerProps } from './contract/slots.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    conversationDetails: import('./details/controller.ts').ConversationDetailsController
  }
}
```

Add `conversationDetails` to the published Client plugin's service contract and
to any inject/type catalogs generated from the source declarations.

- [ ] **Step 4: Regenerate catalogs and declarations with repository scripts**

Run the repository's checked-in generators rather than editing generated
catalog output by hand:

```bash
corepack pnpm run build:lib:client
corepack pnpm exec tsx scripts/gen-cordis-catalog.ts
```

Review the generated diff and retain only output caused by the new service and
slot.

- [ ] **Step 5: Run focused and package-level verification**

Run:

```bash
corepack pnpm exec vitest run packages/client/ui-chat/tests packages/extensions/cordis-client-runner/tests/slot-catalog.spec.ts
corepack pnpm run typecheck
corepack pnpm run verify-package-invariants
corepack pnpm run verify-doc-refs
```

Expected: all commands exit 0.

- [ ] **Step 6: Confirm the seam remains generic**

Run:

```bash
rg -n "cron|schedule" packages/client/ui-chat/src packages/client/ui-chat/tests packages/extensions/cordis-client-runner/src/client/slot-catalog.ts
```

Expected: no new Cron-specific source or documentation introduced by this
change. Existing unrelated matches, if any, must be inspected rather than
blindly accepted.

- [ ] **Step 7: Commit the public seam**

```bash
git add packages/client/ui-chat/src/client/index.ts packages/client/ui-chat/tests/views-type-chain.client.spec.tsx packages/extensions/cordis-client-runner/src/client/slot-catalog.ts packages/extensions/cordis-client-runner/tests/slot-catalog.spec.ts
git commit -m "feat(ui-chat): publish details view seam"
```

### Task 4: Upstream Release and Consumer Handoff

**Files:**
- Modify only the upstream release metadata required by the upstream release process.
- Do not modify the packaging repository in this task.

**Interfaces:**
- Consumes: the verified public seam from Tasks 1-3.
- Produces: a published DSH revision whose `@deepseek-ai/dsh-client-ui-chat` Client package exports `conversationDetails` and `conversation.details.view`.

- [ ] **Step 1: Run the upstream release gate selected by repository policy**

Run:

```bash
corepack pnpm run check:ci
```

Expected: exit 0. Do not publish from a dirty worktree or with skipped focused
tests.

- [ ] **Step 2: Record the exact releasable revision**

Run:

```bash
git status --short
git rev-parse HEAD
```

Expected: empty status and a full commit SHA containing the three reviewed
commits above.

- [ ] **Step 3: Release through the upstream project's normal reviewed process**

The release must include the Client library and generated Cordis catalog. Do
not copy build output into the packaging repository or mutate its pinned
checkout during publication.

- [ ] **Step 4: Hand the full released commit SHA and package version to the `dsh-cron` plan**

The consumer plan uses that exact SHA in `upstream.lock.json` and the matching
published package version in `plugins/cron/package.json`; it must not use a
branch name, floating tag, or local source patch.

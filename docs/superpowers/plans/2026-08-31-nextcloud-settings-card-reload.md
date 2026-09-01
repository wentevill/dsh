# Nextcloud Settings Card Reload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the current saved Nextcloud configuration, including Allowed directories, whenever the Settings card mounts without an application restart.

**Architecture:** Keep the Host settings Remote and save contract unchanged. Move the browser-side initial settings read from client-plugin activation into the `Card` mount lifecycle, where it hydrates the editable state and saved baseline; keep the save response as the immediate local update. This follows the Confluence card's mount-time loading boundary.

**Tech Stack:** TypeScript, React 19, Cordis client slots, Typert Remote, Vitest, tsdown.

## Global Constraints

- Change only `plugins/nextcloud` client behavior and its focused tests.
- Preserve the `{ ok, value | error }` Remote-result contract and the existing Host settings schema.
- A load failure must retain safe empty defaults and show the existing failure status.
- Do not alter credential handling, persistence semantics, or other plugins.

---

### Task 1: Reload persisted settings when the card mounts

**Files:**

- Modify: `plugins/nextcloud/src/client/index.tsx:5-100`
- Modify: `plugins/nextcloud/tests/client-activation.spec.ts:4-42`
- Test: `plugins/nextcloud/tests/client-load.spec.ts`

**Interfaces:**

- Consumes: `remoteApi.load(): Promise<RemoteResult<{ settings: NextcloudSettings }>>`.
- Produces: a `Card` that hydrates `settings` and `baseline` from `loadNextcloudCardSettings(remoteApi)` on mount.
- Preserves: `remoteApi.save({ settings }): Promise<RemoteResult<{ settings: NextcloudSettings }>>` and `storeNextcloudCredential(credentials, value)`.

- [ ] **Step 1: Write the failing lifecycle-boundary test**

In `plugins/nextcloud/tests/client-activation.spec.ts`, make `nextcloudSettings.load` a `vi.fn`, activate the client plugin, and assert that activation itself does not call `load`. The regression name must state that the card, rather than plugin activation, owns its configuration read:

```ts
expect(nextcloudSettings.load).not.toHaveBeenCalled()
```

- [ ] **Step 2: Run test to verify it fails**

Run `CI=true corepack pnpm --dir plugins/nextcloud exec vitest run tests/client-activation.spec.ts`.

Expected: the new assertion fails because `apply()` currently calls `loadNextcloudCardSettings(remoteApi)` before registering the slot.

- [ ] **Step 3: Move the load boundary into the card**

In `plugins/nextcloud/src/client/index.tsx`, import `useEffect` and `useRef`, add an empty settings constant, and hydrate both state values on mount:

```ts
const EMPTY: NextcloudSettings = {
  serverUrl: '', username: '', accessMode: 'all', allowedRoots: [],
  allowDelete: false, allowHttp: false, skipTlsVerify: false,
}

const initialRemote = useRef(remoteApi)
const [baseline, setBaseline] = useState(EMPTY)
const [settings, setSettings] = useState(EMPTY)
useEffect(() => {
  void loadNextcloudCardSettings(initialRemote.current)
    .then(saved => { setSettings(saved); setBaseline(saved) })
    .catch(() => setStatus('failed'))
}, [])
```

Remove `initialSettings` from `Card`, delete the activation-time load, and register the card with `remoteApi`, `credentials`, and `t`. Keep `save()` assigning `saved.settings` to both state values.

- [ ] **Step 4: Run focused tests to verify they pass**

Run `CI=true corepack pnpm --dir plugins/nextcloud exec vitest run tests/client-activation.spec.ts tests/client-load.spec.ts`.

Expected: activation makes no stale load request, and Remote-result decoding still passes.

- [ ] **Step 5: Commit the source and focused tests**

Run `git add plugins/nextcloud/src/client/index.tsx plugins/nextcloud/tests/client-activation.spec.ts && git commit -m "fix: reload nextcloud settings card state"`.

### Task 2: Rebuild and verify the distributable plugin

**Files:**

- Modify: `plugins/nextcloud/lib/client.js`
- Verify: `plugins/nextcloud/tests/*.spec.ts`

**Interfaces:**

- Consumes: the changed browser source from Task 1.
- Produces: the `dsh-nextcloud/client` browser bundle with the card-mount load behavior.

- [ ] **Step 1: Build the Nextcloud plugin**

Run `CI=true corepack pnpm --dir plugins/nextcloud run build`.

Expected: the host declarations, Typert descriptors, and `lib/client.js` generate with exit code 0.

- [ ] **Step 2: Run the complete Nextcloud test suite**

Run `CI=true corepack pnpm --dir plugins/nextcloud test`.

Expected: every non-live test passes; the environment-gated live smoke test remains skipped unless its credentials are supplied.

- [ ] **Step 3: Inspect the generated artifact and diff**

Run `rg -n 'loadNextcloudCardSettings|useEffect|initialSettings' plugins/nextcloud/lib/client.js && git diff --check -- plugins/nextcloud/src/client/index.tsx plugins/nextcloud/tests/client-activation.spec.ts plugins/nextcloud/lib/client.js`.

Expected: the bundle contains the card-mount load logic, no activation-time `initialSettings` argument, and no whitespace errors.

- [ ] **Step 4: Commit generated artifact updates**

Run `git add plugins/nextcloud/lib/client.js && git commit -m "build: update nextcloud client bundle"`.

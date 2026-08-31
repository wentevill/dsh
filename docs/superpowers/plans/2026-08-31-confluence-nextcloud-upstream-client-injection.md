# Confluence and Nextcloud Upstream Client Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Confluence and Nextcloud settings cards by removing their obsolete client dependency on the upstream-removed `@deepseek-ai/dsh-client-runtime` package.

**Architecture:** Treat each plugin manifest as an independently testable client-module boundary. Each package test compares its declared `dsh.client.inject` packages with the package names present in the pinned upstream checkout, then the manifest drops only the missing runtime declaration.

**Tech Stack:** JSON package manifests, TypeScript, Vitest, pnpm, pinned upstream Git checkout.

## Global Constraints

- Change only `dsh-confluence` and `dsh-nextcloud` compatibility behavior.
- Do not add a compatibility shim.
- Do not change settings schemas, card components, Remote namespaces, credentials, or persisted configuration.
- Preserve all unrelated working-tree changes.

---

### Task 1: Confluence client injection compatibility

**Files:**
- Modify: `plugins/confluence/tests/package.spec.ts`
- Modify: `plugins/confluence/package.json`

**Interfaces:**
- Consumes: the pinned upstream checkout at `upstream/` and `package.json#dsh.client.inject`.
- Produces: a Confluence client manifest whose declared injection packages all exist in the pinned upstream package catalog.

- [x] **Step 1: Add a failing package-boundary test**

Add a test that reads every tracked upstream `package.json`, builds the literal set of package names, and checks every Confluence client injection against it:

```ts
it('declares only client injections shipped by the pinned upstream', () => {
  const upstream = resolve(root, '../../upstream')
  const manifests = execFileSync('git', ['ls-files', '**/package.json'], {
    cwd: upstream,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean)
  const upstreamPackages = new Set(manifests.flatMap(path => {
    const value = JSON.parse(readFileSync(resolve(upstream, path), 'utf8')) as { name?: unknown }
    return typeof value.name === 'string' ? [value.name] : []
  }))
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    dsh: { client: { inject: string[] } }
  }

  expect(manifest.dsh.client.inject.filter(name => !upstreamPackages.has(name))).toEqual([])
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `CI=true corepack pnpm --dir plugins/confluence exec vitest run tests/package.spec.ts`

Expected: FAIL because the missing list contains `@deepseek-ai/dsh-client-runtime`.

- [x] **Step 3: Remove the obsolete Confluence injection**

Delete only this entry from `plugins/confluence/package.json#dsh.client.inject`:

```json
"@deepseek-ai/dsh-client-runtime"
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `CI=true corepack pnpm --dir plugins/confluence exec vitest run tests/package.spec.ts`

Expected: PASS.

- [x] **Step 5: Commit the Confluence change**

```bash
git add plugins/confluence/package.json plugins/confluence/tests/package.spec.ts
git commit -m "fix: update Confluence client injections"
```

### Task 2: Nextcloud client injection compatibility

**Files:**
- Modify: `plugins/nextcloud/tests/package.spec.ts`
- Modify: `plugins/nextcloud/package.json`

**Interfaces:**
- Consumes: the pinned upstream checkout at `upstream/` and `package.json#dsh.client.inject`.
- Produces: a Nextcloud client manifest whose declared injection packages all exist in the pinned upstream package catalog.

- [x] **Step 1: Add a failing package-boundary test**

Add a test that reads every tracked upstream `package.json`, builds the literal set of package names, and checks every Nextcloud client injection against it:

```ts
it('declares only client injections shipped by the pinned upstream', () => {
  const upstream = resolve(root, '../../upstream')
  const manifests = execFileSync('git', ['ls-files', '**/package.json'], {
    cwd: upstream,
    encoding: 'utf8',
  }).trim().split('\n').filter(Boolean)
  const upstreamPackages = new Set(manifests.flatMap(path => {
    const value = JSON.parse(readFileSync(resolve(upstream, path), 'utf8')) as { name?: unknown }
    return typeof value.name === 'string' ? [value.name] : []
  }))
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    dsh: { client: { inject: string[] } }
  }

  expect(manifest.dsh.client.inject.filter(name => !upstreamPackages.has(name))).toEqual([])
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `CI=true corepack pnpm --dir plugins/nextcloud exec vitest run tests/package.spec.ts`

Expected: FAIL because the missing list contains `@deepseek-ai/dsh-client-runtime`.

- [x] **Step 3: Remove the obsolete Nextcloud injection**

Delete only this entry from `plugins/nextcloud/package.json#dsh.client.inject`:

```json
"@deepseek-ai/dsh-client-runtime"
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `CI=true corepack pnpm --dir plugins/nextcloud exec vitest run tests/package.spec.ts`

Expected: PASS.

- [x] **Step 5: Commit the Nextcloud change**

```bash
git add plugins/nextcloud/package.json plugins/nextcloud/tests/package.spec.ts
git commit -m "fix: update Nextcloud client injections"
```

### Task 3: Build and regression verification

**Files:**
- Verify generated artifacts under `plugins/confluence/lib/`
- Verify generated artifacts under `plugins/nextcloud/lib/`

**Interfaces:**
- Consumes: the corrected package manifests from Tasks 1 and 2.
- Produces: publishable plugin packages and fresh evidence that both complete plugin suites pass.

- [x] **Step 1: Build both publishable plugins**

Run:

```bash
CI=true corepack pnpm --dir plugins/confluence run build
CI=true corepack pnpm --dir plugins/nextcloud run build
```

Expected: both commands exit 0 and produce `lib/client.js` plus their Host and Typert artifacts.

- [x] **Step 2: Run both complete plugin suites**

Run:

```bash
CI=true corepack pnpm --dir plugins/confluence test
CI=true corepack pnpm --dir plugins/nextcloud test
```

Expected: all non-live tests pass; the opt-in live Nextcloud test remains skipped without credentials.

- [x] **Step 3: Verify publishable archives include client bundles**

Run:

```bash
CI=true corepack pnpm --dir plugins/confluence pack --pack-destination /tmp
CI=true corepack pnpm --dir plugins/nextcloud pack --pack-destination /tmp
```

Expected: each command exits 0; package tests independently verify `package/lib/client.js` is present.

- [x] **Step 4: Inspect the final scoped diff**

Run: `git diff --check && git diff -- plugins/confluence plugins/nextcloud`

Expected: no whitespace errors; production changes are limited to removing the obsolete manifest injection, with matching regression tests and regenerated artifacts only when the build changes them.

- [x] **Step 5: Commit any build-output updates**

If the builds changed tracked artifacts:

```bash
git add plugins/confluence/lib plugins/nextcloud/lib
git commit -m "build: refresh plugin artifacts"
```

If no tracked artifacts changed, do not create an empty commit.

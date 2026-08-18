# macOS Drag-Install DMG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a macOS DMG containing `DeepSeek Harness.app` and an `Applications` shortcut targeting `/Applications`.

**Architecture:** `package-dmg.ts` prepares an isolated temporary volume directory, copies the built application into it, creates the standard Applications symbolic link, and passes that directory to `hdiutil`. The preparation helper is tested independently; the completed image is mounted for release verification.

**Tech Stack:** TypeScript, Node.js filesystem APIs, Vitest, macOS `hdiutil`.

## Global Constraints

- The DMG remains a read-only compressed UDIF.
- Packaging never writes to `/Applications` or requests administrator privileges.
- Temporary staging data is removed after success or failure.
- Existing mounted images are not detached or modified by packaging.

---

### Task 1: Standard drag-install volume layout

**Files:**
- Create: `apps/desktop/scripts/package-dmg.spec.ts`
- Modify: `apps/desktop/scripts/package-dmg.ts`
- Modify: `.agents/notes/implemented/bug-fix/2026-08-18-tauri-runtime-bundle-closure.md`
- Modify: `.agents/notes/implemented/bug-fix/2026-08-18-tauri-runtime-bundle-closure.zh.md`

**Interfaces:**
- Consumes: a built `.app` directory and final DMG output path.
- Produces: `prepareDmgSource(appPath: string, sourceDirectory: string): void`, plus `packageDmg(appPath: string, outputPath: string): void` using that prepared source.

- [x] **Step 1: Write the failing staging-layout test**

```ts
it('stages the app beside an Applications shortcut', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-dmg-'))
  const app = join(root, 'DeepSeek Harness.app')
  const source = join(root, 'source')
  mkdirSync(app)
  writeFileSync(join(app, 'marker'), 'app')

  prepareDmgSource(app, source)

  expect(readFileSync(join(source, 'DeepSeek Harness.app/marker'), 'utf8')).toBe('app')
  expect(readlinkSync(join(source, 'Applications'))).toBe('/Applications')
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm --workspace @deepseek-ai/dsh-desktop test -- --run scripts/package-dmg.spec.ts`

Expected: FAIL because `prepareDmgSource` is not exported.

- [x] **Step 3: Implement isolated DMG staging**

```ts
export function prepareDmgSource(appPath: string, sourceDirectory: string): void {
  mkdirSync(sourceDirectory)
  cpSync(appPath, join(sourceDirectory, basename(appPath)), { recursive: true })
  symlinkSync('/Applications', join(sourceDirectory, 'Applications'))
}
```

`packageDmg` creates a temporary directory beside the output, calls `prepareDmgSource`, invokes `hdiutil create -srcfolder <source>`, and removes the temporary directory in `finally`.

- [x] **Step 4: Run focused and Desktop tests**

Run: `npm --workspace @deepseek-ai/dsh-desktop test -- --run scripts/package-dmg.spec.ts`

Expected: PASS.

Run: `npm --workspace @deepseek-ai/dsh-desktop test`

Expected: all Desktop tests pass.

- [x] **Step 5: Update the owning Agent Note and consistency record**

Add the drag-install volume layout and its deliberate non-automatic installation behavior to the existing English and Chinese Agent Note, then run:

`npm run verify-translation-pairing -- --write .agents/notes/implemented/bug-fix/2026-08-18-tauri-runtime-bundle-closure.md`

- [x] **Step 6: Build and mount the final DMG**

Run: `npm --workspace @deepseek-ai/dsh-desktop run build`

Mount the generated image read-only and verify that its root contains `DeepSeek Harness.app` plus `Applications -> /Applications`, then detach the exact mounted device.

- [x] **Step 7: Commit the implementation**

```bash
git add apps/desktop/scripts/package-dmg.ts apps/desktop/scripts/package-dmg.spec.ts .agents/notes/implemented/bug-fix/2026-08-18-tauri-runtime-bundle-closure.md .agents/notes/implemented/bug-fix/2026-08-18-tauri-runtime-bundle-closure.zh.md .agents/notes/implemented/bug-fix/2026-08-18-tauri-runtime-bundle-closure.i18n.yaml
git commit -m "fix: add Applications shortcut to macos dmg"
```

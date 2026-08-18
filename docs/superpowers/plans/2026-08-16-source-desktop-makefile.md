# Source Desktop Makefile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal root Makefile that installs the official source checkout and starts its Web UI.

**Architecture:** The Makefile delegates dependency installation, build, watch, and Web server behavior to the repository's existing pnpm scripts. One prerequisite target validates the Node.js engine floor before any pnpm operation, so unsupported runtimes fail with an actionable diagnostic.

**Tech Stack:** GNU/BSD Make, Node.js `^22.19.0 || >=24.0.0`, Corepack, pnpm `11.7.0`, DeepSeek Harness CLI.

## Global Constraints

Node.js must satisfy `^22.19.0 || >=24.0.0`.

The repository-pinned `pnpm@11.7.0` is the package-manager source of truth.

The Web UI runs in the foreground through `pnpm dsh web` and defaults to `http://127.0.0.1:3080`.

The Makefile does not manage background processes, open a browser, or store credentials.

---

### Task 1: Root Desktop Make Targets

**Files:**
- Create: `Makefile`

**Interfaces:**
- Consumes: root `package.json` scripts `build`, `dsh`, and `dev:web`; the pinned package manager field.
- Produces: Make targets `help`, `check-node`, `install`, `desktop`, and `desktop-dev`.

- [x] **Step 1: Verify the targets do not exist**

Run: `make help`

Expected: FAIL because the root Makefile does not exist.

- [x] **Step 2: Add the minimal Makefile**

```make
NODE ?= node
COREPACK ?= corepack

USE_SELECTED_NODE = node_cmd='$(NODE)'; if test "$$node_cmd" = node && command -v brew >/dev/null 2>&1 && test -x "$$(brew --prefix node@24 2>/dev/null)/bin/node"; then node_cmd="$$(brew --prefix node@24)/bin/node"; fi; node_path="$$(command -v "$$node_cmd")" || { echo 'error: Node.js is required' >&2; exit 1; }; PATH="$$(dirname "$$node_path"):$$PATH"; export PATH;

.PHONY: help check-node install desktop desktop-dev

help:
	@printf '%s\n' \
		'install      Install dependencies and build from source' \
		'desktop      Start the Web UI in the foreground' \
		'desktop-dev  Watch Web client plugin builds'

check-node:
	@$(USE_SELECTED_NODE) "$$node_path" -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (!((major === 22 && minor >= 19) || major >= 24)) { console.error(`error: Node.js $${process.versions.node} is unsupported; install ^22.19.0 or >=24.0.0`); process.exit(1) }' || exit $$?; command -v "$(COREPACK)" >/dev/null 2>&1 || { echo 'error: Corepack is required' >&2; exit 1; }

install: check-node
	$(USE_SELECTED_NODE) $(COREPACK) pnpm install --frozen-lockfile
	$(USE_SELECTED_NODE) $(COREPACK) pnpm run build

desktop: check-node
	$(USE_SELECTED_NODE) $(COREPACK) pnpm dsh web

desktop-dev: check-node
	$(USE_SELECTED_NODE) $(COREPACK) pnpm run dev:web
```

- [x] **Step 3: Verify the unsupported local Node.js version is rejected**

Run: `make check-node`

Expected: FAIL and report that Node.js `22.14.0` is unsupported.

- [x] **Step 4: Install a supported Node.js runtime and verify target parsing**

Run: `brew install node@24`, then prepend Homebrew's `node@24/bin` to `PATH` for all remaining commands.

Run: `make check-node && make help && make -n desktop && make -n desktop-dev`

Expected: PASS; help lists all public targets and dry runs delegate to the official pnpm commands.

- [x] **Step 5: Install dependencies and build**

Run: `make install`

Expected: pnpm uses the lockfile and `pnpm run build` exits successfully.

- [x] **Step 6: Verify the Web UI startup path**

Run `make desktop` in a foreground-controlled terminal session, poll `http://127.0.0.1:3080` until it returns an HTTP response, then send `Ctrl+C` and wait for the process to exit.

Expected: the server announces `127.0.0.1:3080`, the HTTP probe succeeds, and `Ctrl+C` terminates the foreground process.

- [x] **Step 7: Run final repository checks for the changed surface**

Run: `git diff --check && make check-node && make -n install desktop desktop-dev`

Expected: PASS with no whitespace errors and all target recipes parse.

- [x] **Step 8: Commit**

```bash
git add Makefile docs/superpowers/plans/2026-08-16-source-desktop-makefile.md
git commit -m "build: add source desktop make targets"
```

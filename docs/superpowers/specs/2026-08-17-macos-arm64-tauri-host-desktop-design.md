# macOS arm64 Tauri Host Desktop Design

## Goal

Ship DeepSeek Harness as a macOS Apple Silicon desktop application that starts the built Harness server with an application-bundled Node.js runtime and displays the existing Web UI in Tauri. The application must not require a host Node.js, npm, pnpm, Python, Homebrew, or project-tool installation.

## Deliverables

The MVP produces an unsigned macOS arm64 `.app` and `.dmg`. The application starts one Harness server, waits for it to become ready, loads the existing Web UI, and terminates the server process tree when the application exits.

Code signing, notarization, automatic updates, Intel macOS, Windows, Linux, and Computer-backed execution are outside this MVP.

## Application architecture

The desktop application lives under `apps/desktop/`. It contains the Tauri Rust host and packaging configuration but does not copy the Web client or Harness server source.

```text
DSH Host Desktop.app
├── Tauri WebView
├── Tauri Rust host
├── bundled Node.js arm64
├── built DSH server artifact
├── built Web UI assets
└── bundled tool and runtime resources
```

The build reuses the existing `apps/web` client and the `dsh-web-app` bundle. The desktop application starts the built server artifact with the bundled Node.js executable; it never runs server TypeScript through `tsx` and never resolves production modules from the source workspace or pnpm store.

The Tauri host owns desktop process lifecycle only. DeepSeek Harness continues to own sessions, agents, tools, permissions, settings, credentials, and Web/API behavior.

## Startup

At startup, Tauri resolves every resource relative to the application bundle layout and creates a private runtime directory. It starts the existing built Harness CLI with the bundled Node.js executable, an explicit Harness data directory, the `web` profile, loopback binding, and an OS-assigned port.

The server listens only on `127.0.0.1`. Tauri parses the existing `dsh web:` startup line and verifies that the reported loopback URL responds before navigating the WebView. A fixed startup deadline bounds the wait. The application never starts a second server while the first launch is starting or ready.

The WebView displays the existing DeepSeek Harness Web UI. The Host Desktop adds no parallel Computer page, session model, router, state store, or style system.

## Runtime resources

The application bundle supplies Node.js and every tool that the shipped Harness composition requires. Runtime lookup uses explicit bundle paths and does not search the host `PATH` for Node.js, npm, pnpm, Python, Homebrew, or required tools.

The application performs no package-manager or system-package installation at startup. User-requested shell commands retain the existing Harness host execution and permission semantics; this MVP does not claim VM isolation.

## Local transport

The MVP uses the existing Harness loopback Web transport without adding Desktop authentication or another request-protection layer. Tauri accepts only the exact `http://127.0.0.1:<port>` origin printed by its owned child process.

## Shutdown and recovery

Normal application exit first asks the Harness server to stop accepting work and exit. A fixed grace period bounds the request; expiry terminates the complete child process tree. Tauri retains the process handle until the child exits and does not leave an unmanaged sidecar.

Tauri never searches for or terminates processes by executable name. An abnormal application termination may leave cleanup to the operating system; the next launch starts one new owned child and does not act on unrelated processes.

The WebView may reconnect to the current server after a transient navigation failure. Reconnection never creates another server.

## Failure behavior

Resource validation fails before process creation when the bundled Node.js executable, server entry, Web assets, or required tools are absent. Diagnostics identify the missing resource and expected bundle-relative location.

If Node.js cannot start, the application shows a runtime-start failure. If the Harness server exits before readiness, the application shows its exit status and bounded stderr. If readiness times out, Tauri terminates the process tree before showing the timeout. Diagnostics exclude environment variables, credentials, and unbounded process output.

## Build and packaging

Packaging has three ordered inputs: the existing pnpm build outputs, a pinned macOS arm64 Node.js distribution plus required tool resources, and the Tauri application. The final packaging step collects only production artifacts and fails when any required input is absent.

An artifact audit rejects a non-arm64 Node.js executable and production references to `tsx`, the pnpm store, workspace source entry points, development-machine absolute paths, or host runtime discovery. The audit inspects the packaged `.app`, not only the staging directory.

The MVP emits unsigned artifacts. Signing, notarization, entitlements required only by later Computer virtualization, and update metadata are separate release work.

## Verification

Rust unit tests cover bundle-relative resource resolution, lifecycle state transitions, startup timeout, error classification, bounded diagnostics, and child-tree cleanup.

An artifact test starts the built Harness server with the bundled Node.js executable from a temporary working directory that cannot resolve repository source or development dependencies. It verifies readiness, HTTP service, WebSocket service, graceful shutdown, and process exit.

A packaged-application audit verifies the Node.js architecture and the presence of the server entry, Web assets, and required tools. A smoke test launches the application with a restricted `PATH`, loads the existing UI, exercises a keyless Harness health path, exits the application, and confirms that no owned server process remains.

Existing Web end-to-end tests remain authoritative for the UI. Desktop tests cover native startup, packaging, transport, and teardown rather than duplicating Web behavior.

## Deferred Computer Desktop

Computer Desktop remains a separate future distribution, not a DeepSeek Harness capability package. It uses the same Tauri shell and Web UI but runs the complete Harness server, Node.js runtime, tools, Skills, plugins, and generated code inside an ephemeral Linux VM backed by macOS `Virtualization.framework`.

```text
DSH Computer Desktop
├── Tauri host shell
├── DeepSeek Harness Web UI
└── Computer
    ├── Linux VM
    ├── DSH server and bundled runtimes
    ├── persistent /workspace
    └── persistent /home/dsh
```

The host runs Tauri and VM lifecycle code but performs no project installation or environment execution. `/workspace` and `/home/dsh` survive VM replacement; guest processes, `/tmp`, and VM transient state do not. Computer Desktop is built as a different distribution rather than a runtime switch in Host Desktop.

The future design may reuse Cloudflare Computer's persistent workspace and pluggable execution-backend model, but its Durable Object, SQLite, FUSE synchronization, and Cloudflare runtime implementation are not a local Desktop dependency. Snapshotting, CAS, host-resource grants, cross-architecture migration, and plugin process isolation remain outside the Host Desktop MVP.

## Alternatives considered

**Ship one application with Host and Computer modes.** This makes every Host installation carry a kernel, root filesystem, and VM runtime and creates a runtime mode switch whose state and recovery semantics differ. Separate distributions keep each artifact and lifecycle explicit.

**Use the host Node.js installation.** This makes startup depend on host versions, package managers, shell configuration, and Homebrew state. Bundling the runtime makes the desktop artifact independently runnable.

**Build a new Desktop UI.** This duplicates the existing Web client and creates two owners for chat, sessions, settings, and connection behavior. Tauri displays the existing Web UI instead.

**Implement Computer Desktop first.** This combines Desktop packaging with kernel, image, VM transport, guest lifecycle, and persistent filesystem work. Host Desktop proves the application packaging and UI/server lifecycle before the virtualization project begins.

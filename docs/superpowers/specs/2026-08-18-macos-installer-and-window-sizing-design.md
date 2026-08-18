# macOS installer presentation and startup window design

## Goal

Improve two independent macOS presentation details:

1. The mounted DMG uses the conventional left-to-right drag-install layout with a correctly rendered application icon.
2. The application opens in a larger non-full-screen window that fits within a 13-inch Mac display.

## DMG installer presentation

The mounted `DeepSeek Harness` volume opens as a Finder window 660 by 400 logical points. It shows a 128-point `DeepSeek Harness.app` icon centered near `(170, 190)` and a 128-point `Applications` folder shortcut centered near `(490, 190)`. A background image provides a centered right-facing arrow between them. Finder hides its toolbar and status bar, uses icon view, and fixes both icon positions.

Packaging continues to stage exactly `DeepSeek Harness.app` and `Applications -> /Applications`. The packaging script creates a writable temporary image, mounts it at a private temporary mount point, applies the Finder presentation metadata, detaches it, and converts it to the existing compressed read-only UDZO deliverable. Temporary images and mount directories are removed on both success and failure. The final image continues through the existing DMG audit before publication, with restoration of the previous image if the audit fails.

The application bundle uses a macOS `.icns` resource derived from the canonical project icon and declares it in Tauri bundle configuration. This ensures Finder displays the application artwork rather than a generic application icon. The source artwork must be square and include the standard macOS icon resolutions needed to generate the icon set.

## Startup window

The main Tauri webview window opens at 1152 by 720 logical points and is centered before it becomes visible. It remains resizable, maximizable, and eligible for native full-screen mode. The size applies only to normal, non-full-screen startup and does not turn startup into a maximized or full-screen presentation.

If the current monitor's usable area is smaller than the requested size, the platform constrains the window to the available work area so that the title bar and window controls remain reachable. No maximum size is imposed after startup.

## Components and boundaries

- `apps/desktop/scripts/package-dmg.ts` owns DMG staging, temporary image creation, Finder presentation, compression, auditing, and rollback.
- A checked-in background asset owns only the installer arrow artwork; it contains no application branding that would duplicate the bundle icon.
- `apps/desktop/src-tauri/tauri.conf.json` owns the macOS bundle icon declaration.
- `apps/desktop/src-tauri/src/main.rs` owns the initial main-window size and centering behavior.

The DMG presentation and application startup window do not share runtime state or configuration.

## Failure handling

Failure to create, mount, customize, detach, convert, or audit the DMG stops packaging with a non-zero exit. Cleanup attempts must not replace the original failure. Packaging never writes to `/Applications`; installation happens only when the user explicitly drags the app to the shortcut.

Window creation failures continue to propagate from Tauri setup. Centering is part of creation-time presentation and must occur before the hidden window is shown, preventing a visible resize or reposition flash.

## Verification

- Unit tests verify the native image commands and Finder customization are invoked with the intended window bounds, icon size, icon positions, and background asset.
- Existing staging and rollback tests continue to verify the app-plus-Applications volume contents and atomic publication behavior.
- The release audit mounts the final image read-only and verifies the app bundle and Applications shortcut.
- Bundle tests verify that the macOS icon resource is configured and present.
- Rust tests cover the startup window specification where it can be separated from the Tauri runtime; a macOS build or manual smoke test confirms the visible initial size and centering.

## Alternatives considered

### Add a third-party DMG builder

Tools such as `create-dmg` provide conventional layouts quickly, but add another packaging dependency and make the existing audit and rollback path harder to preserve. Native macOS tooling fits the current packaging architecture better.

### Ship a prebuilt `.DS_Store`

A static Finder metadata file avoids AppleScript during packaging, but is brittle when the volume name, icon names, or layout changes. Generating the metadata against the mounted temporary volume keeps it aligned with the actual deliverable.

### Start maximized

Maximizing would fill the display rather than provide a deliberately larger normal window, and would blur the requested distinction between non-full-screen sizing and full-screen behavior. A fixed initial logical size is more predictable.

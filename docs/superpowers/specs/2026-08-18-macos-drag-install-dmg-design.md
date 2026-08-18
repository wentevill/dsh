# macOS drag-install DMG design

## Goal

The macOS disk image presents `DeepSeek Harness.app` beside an `Applications` shortcut. A user installs the application by dragging the app onto that shortcut.

## Packaging

The DMG script creates a temporary staging directory, copies the built application into it, and creates an `Applications` symbolic link targeting `/Applications`. `hdiutil create` receives the staging directory as its source, so the mounted volume contains exactly these two installation entries. The script removes the staging directory after success or failure and continues to replace an existing output image atomically through the existing output-path behavior.

The DMG remains a read-only compressed UDIF. It does not write to `/Applications`, request administrator privileges, install background services, or change the self-contained Desktop runtime.

## Failure handling

An absent application bundle, failed copy, failed link creation, or failed `hdiutil` command stops packaging with a non-zero exit. Temporary staging data is removed in every case. Existing mounted images are not detached or modified by the packaging script.

## Verification

A unit test exercises staging with a real temporary `.app` directory and verifies that the staged application is a directory and `Applications` resolves to `/Applications`. The release test builds the DMG, mounts it read-only, verifies both entries, checks the shortcut target, and detaches the image. Existing Desktop tests and app/runtime audits remain unchanged.

## Alternatives considered

**Finder window customization.** Rejected for this correction because background artwork, icon positioning, and AppleScript add brittle Finder state without changing installation behavior.

**PKG installer.** Rejected because DeepSeek Harness installs no privileged service, driver, or system-wide support files. A PKG would add signing, authorization, and uninstall complexity without a product requirement.

**Automatic copying after DMG open.** Rejected because mounting a disk image must not mutate `/Applications` without an explicit user installation action.

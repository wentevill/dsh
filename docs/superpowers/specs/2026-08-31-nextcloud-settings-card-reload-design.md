# Nextcloud Settings Card Reload Design

## Goal

Make the Nextcloud card show the current saved Allowed directories value whenever
the Settings page is opened again, without an application restart.

## Root cause

The client plugin loads `nextcloudSettings` once while the plugin activates.
That initial settings object is captured by the registered slot contribution.
Closing and reopening Settings remounts the card with the same captured object,
so it displays the value from before the most recent save. Restarting recreates
the plugin and refreshes that object.

## Design

The card will load its initial saved settings when it mounts, following the
existing Confluence card pattern. The plugin activation will only register the
slot contribution and pass the settings Remote into the card. A successful load
will update both the editable settings and its saved baseline. The existing save
flow continues to use the host's normalized response to update both values
immediately.

## Error handling

A failed initial load will leave the card's safe empty defaults in place and
show the existing failure status. A failed save leaves the editable fields and
baseline unchanged.

## Verification

Add focused client coverage that mounts the registered contribution, verifies
that it loads current settings, saves changed Allowed directories, then remounts
and verifies that the new mount requests and displays the latest value. Keep the
existing settings-boundary and client activation coverage passing. Rebuild the
publishable browser bundle after source tests pass.

## Scope

Only the `dsh-nextcloud` browser card and its tests change. The server settings
schema, persistence semantics, credentials, and other plugins are unchanged.

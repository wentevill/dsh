# WeCom Authorization Card Fix Design

## Goal

Make the WeCom Plugin configuration card bilingual, visibly interactive, and correctly responsive to Host authorization calls.

## Root Causes

- The client copy is hard-coded in Chinese and no locale namespace is registered.
- Generated Typert methods return `RemoteResult<WeComAuthSnapshot>`, but the card stores that envelope as if it were the snapshot. The visible state therefore does not follow status or button calls.
- Unstyled native buttons inherit the shell reset and appear as plain text.

## Client Design

The client registers one `settings.plugins.wecom` dictionary with complete `zh` and `en` entries and reads all visible copy through the injected locale function. A small RemoteResult adapter validates `{ ok, value }`, returns the snapshot on success, and throws the remote error message on failure. Status polling and every action use that adapter.

The card owns a namespaced stylesheet using Harness `--dsw-alias-*` design tokens. Authorization and refresh use a primary button, cancel uses a secondary button, and deletion uses a visually dangerous button. Buttons declare `type="button"`, disabled/busy states, focus-visible outlines, and error feedback. The QR image has localized alternative text.

## Error and State Behavior

Polling failures keep the last valid snapshot and surface an error instead of replacing state with an invalid envelope. Clicking authorize immediately shows the Host's `generating_qr` state; polling then advances to `awaiting_scan`, authorized/schema-refresh, ready, or sync-failed. Remote failures restore the button's enabled state and display their message.

## Delivery and Verification

Unit tests cover RemoteResult success/failure and both dictionaries. Component-facing tests cover button class/registration contracts. The plugin is released as `dsh-wecom@0.1.2`, built, packed, installed through `make install-plugin PLUGIN=wecom PROFILE=web`, and verified with the Desktop runtime.

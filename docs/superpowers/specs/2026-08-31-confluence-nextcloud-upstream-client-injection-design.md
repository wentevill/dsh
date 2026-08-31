# Confluence and Nextcloud Upstream Client Injection Compatibility

## Goal

Restore the Confluence and Nextcloud configuration cards after updating the
pinned upstream Harness revision to `cd5ef8148158c3a752a658978873241fdf8e2bbc`.

## Root cause

The updated upstream no longer ships the product package
`@deepseek-ai/dsh-client-runtime`. Both plugin manifests still name that removed
package in `dsh.client.inject`. The client module graph therefore cannot satisfy
the plugins' declared activation dependencies, so their browser halves never
register their `settings.plugin.item` cards.

The plugin source does not use the removed package at runtime. Its remaining
client dependencies are the current owners of connection, locale, settings,
and Remote services.

## Design

Remove only `@deepseek-ai/dsh-client-runtime` from `dsh.client.inject` in the
Confluence and Nextcloud package manifests. Do not add a compatibility shim and
do not change their settings schemas, card components, Remote namespaces,
credentials, or persisted configuration.

Add package-contract coverage that resolves every declared client injection
against the pinned upstream workspace package catalog. The regression test must
fail when a plugin declares a package removed by upstream and pass after the
obsolete entries are removed.

## Verification

- Observe the new manifest contract tests fail against the current manifests.
- Remove the two obsolete declarations and observe the focused tests pass.
- Build both plugins so their publishable artifacts are current.
- Run the complete Confluence and Nextcloud test suites.
- Exercise the packaged client activation path against the pinned upstream
  runtime where the existing integration harness permits it.

## Scope

This change covers only `dsh-confluence` and `dsh-nextcloud`. Similar stale
declarations in other plugins are intentionally left for separate work. No
stored settings or credentials are migrated or deleted.

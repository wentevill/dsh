# Confluence and Nextcloud Upstream Credential Remote Compatibility

## Goal

Restore the Confluence and Nextcloud configuration cards after updating the
pinned upstream Harness revision to `cd5ef8148158c3a752a658978873241fdf8e2bbc`.

## Root cause

The updated upstream removed the legacy `api` property from
`ConnectionHandle`. Credential configuration is now owned by the generated
`ctx.remote.credentials` namespace. Both cards still capture
`child.get('connection').api` and dereference `api.credentials` when their slot
contribution renders. Their Host settings namespaces and browser bundles are
served correctly, but rendering either registered contribution throws before
the card component is returned.

## Design

Read credentials from `child.remote.credentials`, declare
`remote.credentials` in each card feature's Cordis injection list, and remove
the obsolete runtime read of `ConnectionHandle.api`. Credential writes use the
current positional `set(ref, value)` Remote method and continue to unwrap the
standard `{ ok, value | error }` result.

Add client activation coverage that omits the obsolete connection service,
activates each real client plugin, invokes its registered
`settings.plugin.item` contribution, and asserts rendering does not throw. Add
credential-write coverage for the positional Remote boundary.

## Verification

- Observe both activation tests fail with an `api.credentials` dereference.
- Migrate both clients to `remote.credentials` and observe the focused tests pass.
- Build both plugins so their publishable artifacts are current.
- Run the complete Confluence and Nextcloud test suites.
- Pack both plugins and verify that each archive contains its generated browser
  client bundle.

## Scope

This change covers only `dsh-confluence` and `dsh-nextcloud`. Manifest cleanup
and other plugins' credential migrations are intentionally left for separate
work. No stored settings or credentials are migrated or deleted.

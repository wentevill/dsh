# Official Plugin Migration Design

## Goal

Remove the repository-owned `dsh-plugin-manager` implementation and make every
remaining packaged plugin use the plugin-management and configuration surfaces
shipped by upstream DeepSeek Harness v0.1.6-alpha.2.

## Scope

The migration covers five repository plugins:

- `dsh-mail`
- `dsh-wecom`
- `dsh-confluence`
- `dsh-nextcloud`
- `dsh-cron`

It removes the `plugins/manager` package, its root scripts, its Desktop runtime
archive, its staging helpers, and the Desktop startup bootstrap that previously
prepared or retired it. The upstream packages
`@deepseek-ai/dsh-plugin-manager` and
`@deepseek-ai/dsh-client-ui-plugin-manager` remain part of the pinned upstream
runtime and become the only plugin manager implementation.

Existing user profiles are outside the migration boundary. In particular, the
Desktop does not automatically uninstall, edit, or otherwise clean an existing
`dsh-plugin-manager` dependency or bundle selection. This change only controls
new source builds and their packaged runtime.

## Packaging and Installation

The root Makefile exposes the complete supported plugin set as
`mail | wecom | confluence | nextcloud | cron`. `manager` is rejected as an
unsupported plugin.

Each plugin's release archive is ultimately installed through the bundled
official CLI command:

```text
dsh plugin --profile <profile> add <absolute-tarball-path>
```

Mail keeps its hermetic/offline release packaging and installation wrapper,
because that wrapper supplies a private pnpm environment and persistent store.
The wrapper continues to call the same official `dsh plugin` command. The other
four plugins use the bundled Node, CLI, and pnpm path directly from the installed
Desktop application. Cron gains the same Makefile pack/install support as the
other non-Mail plugins.

The Desktop runtime staging process no longer copies the private manager package
into the upstream assembly, adds it to Desktop dependencies, produces a manager
tarball, or stages a manager bootstrap script. Tauri resource discovery and
server startup require only Node, the official DSH CLI, and the private package
bin directory.

## Configuration Page Migration

Mail, WeCom, Confluence, and Nextcloud currently register cards in the obsolete
`settings.plugin.item` slot. Each moves to the official plugin manager's keyed
`plugins.row.config` slot because each form configures one row declared by its
bundle patch.

The exact keys are:

| Package | Patch row | Configuration key |
|---|---|---|
| `dsh-mail` | `mail` | `dsh-mail#mail` |
| `dsh-wecom` | `wecom` | `dsh-wecom#wecom` |
| `dsh-confluence` | `confluence` | `dsh-confluence#confluence` |
| `dsh-nextcloud` | `nextcloud` | `dsh-nextcloud#nextcloud` |

Each package imports the official slot contract as a type-only dependency from
`@deepseek-ai/dsh-client-ui-plugin-manager/client`. No plugin imports or bundles
the official manager at runtime.

Each registered renderer accepts the owner property
`view: 'summary' | 'page'`:

- `summary` returns the plugin's localized one-line description without loading
  or mutating remote configuration.
- `page` renders the existing form or authorization controls with its own save,
  discard, test, connect, refresh, or removal actions as applicable.

The official plugin page owns the title, breadcrumb, navigation, and surrounding
page layout. Plugin renderers therefore stop emitting the old settings-list
`<li>` card shell, expandable header, and chevron. Form state remains local to
the page renderer, so leaving the page discards unsaved edits as required by the
official contract. Saved settings, credentials, Remote calls, polling, and Host
configuration namespaces do not change.

Cron has no settings form. It remains visible and manageable as a bundle and
continues to contribute its existing tool-view UI, but it does not register a
configuration slot.

## Compatibility

The staged runtime retains the legacy Typert adapter introduced for plugins
whose generated descriptors expose an eager `schema` instead of v0.1.6's
`create()` factory. Removing the private manager must not remove this adapter.
It remains runtime-wide so existing Mail, resource dashboard, Cron, and other
pre-v0.1.6 plugin archives can activate.

Package development dependencies move from the old settings configuration slot
provider to the official UI plugin manager contract where required. The
configuration registration is type-only; release archives must not acquire a
second manager implementation.

## Error Handling

Unsupported Makefile plugin names fail before packaging and print the complete
supported list. Pack/install targets fail clearly when the installed app lacks
the bundled Node, official CLI, private pnpm executable, or selected archive.

Configuration pages retain their current Remote error presentation. A missing
official configuration slot merely delays registration through `slots.inject`;
it does not prevent the plugin's Host half from activating.

## Verification

Implementation follows test-driven development and must demonstrate:

1. Makefile dry runs support all five plugins, reject `manager`, and install
   archives through the official CLI path.
2. Desktop runtime staging has no private manager copy, archive, bootstrap, or
   dependency, while retaining the Typert compatibility patch.
3. Tauri resource and lifecycle tests start the official Host without a manager
   bootstrap resource.
4. Mail, WeCom, Confluence, and Nextcloud register the exact
   `plugins.row.config` keys and render distinct summary and page views.
5. Cron remains packageable/installable and does not claim a configuration page.
6. Desktop unit tests, plugin package tests, Rust tests, runtime audit, plugin
   installation E2E, signed app audit, and DMG verification pass before release.

## Non-Goals

- Automatically removing the legacy manager from an existing user profile.
- Migrating or rewriting user-owned `cordis.patch.yml` data.
- Adding a Cron settings form.
- Replacing plugin-specific settings storage, credential storage, or Remote APIs.
- Changing upstream source or maintaining a fork of the official manager.

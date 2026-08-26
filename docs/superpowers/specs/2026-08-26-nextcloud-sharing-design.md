# Nextcloud Sharing Design

## Goal

Extend the existing `dsh-nextcloud` plugin with public-link, user, and group sharing while preserving its authentication, path-policy, approval, packaging, and settings behavior.

## Scope

The plugin will expose read-only operations to list shares, inspect one share, and search user/group recipients. It will expose approval-gated operations to create, update, and revoke shares.

Supported share targets are public links, Nextcloud users, and Nextcloud groups. Supported permission profiles are:

- `read`: read permission (`1`).
- `edit`: read, update, create, and delete permissions (`15`), excluding re-share permission.
- `fileDrop`: create-only public upload. It is valid only for a public-link share targeting a directory.

Public links accept an optional password, expiration date in `YYYY-MM-DD`, note, and label. Passwords are write-only and must never be returned, logged, fingerprinted, or included verbatim in approval text.

## Architecture

Sharing remains part of the single `dsh-nextcloud` plugin. The existing transport module will own both authenticated WebDAV file requests and authenticated OCS requests, but OCS request construction and response parsing will live in focused sharing files.

The transport uses the same normalized server URL, username, application password, HTTP opt-in, TLS verification setting, redirect policy, cancellation signal, and stable error mapping as file operations. OCS calls target `/ocs/v2.php/apps/files_sharing/api/v1/shares`; recipient search targets the documented Sharee API. Every OCS request sends `OCS-APIRequest: true` and requests JSON where supported.

The file service remains responsible for path-policy checks. A sharing service composes that path validation with share input validation, permission-profile mapping, result bounds, and response redaction.

## Tools

- `nextcloud_share_list`: list shares, optionally filtered by an allowed path. Results are bounded to 100 with explicit truncation.
- `nextcloud_share_get`: retrieve one share by numeric ID.
- `nextcloud_sharee_search`: search local users and groups, bounded to 100. Global lookup is disabled.
- `nextcloud_share_create`: create a public-link, user, or group share.
- `nextcloud_share_update`: change permission profile or public-link options on an existing share.
- `nextcloud_share_delete`: revoke an existing share.

User and group creation requires an exact recipient identifier. Public-link creation does not accept a recipient. File Drop requires a directory and a public-link target.

## Approval and Concurrency Safety

All create, update, and revoke calls require fresh human approval. Approval text displays the normalized path, target type, recipient when applicable, permission profile, expiration date, note/label presence, and whether a password will be set or changed. It never displays the password.

Before approval, the plugin validates the path, reads its metadata, and retrieves the current share for update/revoke. The approval binding records a hash of non-secret arguments, effective settings and credential fingerprint, file ETag when available, and the current normalized share state. Before execution, it re-resolves configuration and credentials and rechecks those values. Any mismatch requires new approval.

## Validation and Errors

All share paths must pass the existing all-directories/allowlist policy. Explicit paths outside configured roots are rejected. Expiration dates must be valid `YYYY-MM-DD` calendar dates. Empty recipient identifiers, invalid share IDs, incompatible File Drop inputs, and unsupported permission combinations are rejected before network mutation.

OCS transport errors and OCS meta-status failures map through stable Nextcloud error codes. Admin-disabled public upload is reported distinctly. Secret fields are omitted from returned share objects.

## Testing

Protocol tests will cover OCS headers, endpoints, form encoding, share-type values, permission masks, response parsing, and meta-status failures. Service tests will cover path enforcement, result bounds, date validation, File Drop directory checks, and password redaction. Tool tests will cover fresh approval, exact normalized approval details, secret omission, and stale share/config/credential rejection. The optional live test remains opt-in and performs no mutation unless a dedicated sharing mutation flag is supplied.

## Packaging

The sharing implementation ships inside the existing `dsh-nextcloud-0.1.0.tgz`. No additional plugin, settings card, credential, or installation step is introduced.

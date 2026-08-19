# DSH Mail

Production Mail bundle for DeepSeek Harness. The `dsh-mail-0.2.0.tgz`
archive contains its complete IMAP, MIME, SMTP, HTML conversion, validation,
and schema dependency trees. DSH capabilities remain peers supplied by the
Desktop runtime.

From the Desktop packaging checkout, build the archive and install it into the
Web profile with one command:

```sh
make install-plugin
```

This command deliberately uses the Node, pnpm, and DSH executables embedded in
`/Applications/DeepSeek Harness.app`; the host does not need Node, npm, pnpm,
or a separately installed `dsh`. Quit DeepSeek Harness before installing, then
open it again after the command succeeds.

To create the release archive without changing a profile, run:

```sh
make pack-plugin
```

Override `APP_PATH`, `PROFILE`, or `DESKTOP_DSH_HOME` only when testing a
non-default Desktop installation or profile.

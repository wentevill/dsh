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

Before installing, remove the legacy `dsh-mail-plugin` package if it is present
in the same Web profile. The old and new packages both provide `mailSettings`,
so leaving both installed makes Host boot fail with a duplicate service. With
DeepSeek Harness quit, run exactly:

```sh
RUNTIME="/Applications/DeepSeek Harness.app/Contents/Resources/runtime"
DSH_HOME="$HOME/Library/Application Support/ai.deepseek.harness/harness" \
PATH="$RUNTIME/node/bin:$RUNTIME/app/node_modules/.bin:/usr/bin:/bin" \
"$RUNTIME/node/bin/node" \
  "$RUNTIME/app/node_modules/@deepseek-ai/dsh/lib/bin.js" \
  plugin --profile web remove dsh-mail-plugin
```

This removes only the `dsh-mail-plugin` dependency and reconciles that one
bundle entry; other dependencies and bundles in the profile are preserved. Do
not run the removal when the profile does not contain the legacy package.

To create the release archive without changing a profile, run:

```sh
make pack-plugin
```

Override `APP_PATH`, `PROFILE`, or `DESKTOP_DSH_HOME` only when testing a
non-default Desktop installation or profile.

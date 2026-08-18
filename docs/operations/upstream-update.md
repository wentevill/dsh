# Updating upstream

The GitHub checkout is source input, not a packaging workspace. Update it only
as an explicit reviewed operation.

1. Confirm the packaging repository and `upstream` checkout are clean.
2. Fetch GitHub changes in `deepseek-harness-source` without changing packaging
   files.
3. Review the target commit and check out that exact commit or fast-forward its
   tracking branch.
4. Update only the full `revision` in `upstream.lock.json` after the review.
5. Run `corepack pnpm run verify:upstream`, packaging tests, Desktop tests, and
   a release-shaped runtime stage.
6. Commit the lock change with any packaging compatibility changes.

Never run packaging dependency installation, generation, formatters, Tauri
builds, or runtime staging with `upstream` as their output directory. Never add
private Desktop or plugin files to the upstream checkout. If the guard reports
a dirty checkout, inspect it manually; do not automate `git reset`, `git clean`,
or checkout repair because those commands could destroy upstream developer
work.

The historical branch `archive/desktop-packaging-20260818` is local recovery
data for the migration. Do not delete or push it as part of an upstream update.

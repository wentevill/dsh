# DSH Plugin Manager

Desktop-only plugin manager for the DeepSeek Harness `web` profile.

The `Plugin manager` tab accepts one `.tgz` package at a time, validates it as a publishable DSH bundle, installs it through the Desktop private `dsh` and pnpm runtime, and lists dependency-backed plugins by npm name and installed version. Expanding a plugin card exposes its uninstall action. The manager itself is installed and updated by Desktop and cannot replace or uninstall itself.

Install and uninstall operations take effect after the user restarts Desktop. Package lifecycle scripts are disabled.

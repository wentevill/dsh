# Source Desktop Makefile Design

## Goal

Provide root Make targets that install the official source checkout and start its Web UI.

## Commands

`make install` verifies the repository's Node.js engine requirement (`^22.19.0 || >=24.0.0`), prepares the pinned `pnpm@11.7.0` through Corepack, installs the lockfile dependencies, and runs `pnpm run build`.

`make desktop` runs `pnpm dsh web` in the foreground. DeepSeek Harness serves the Web UI at `http://127.0.0.1:3080` by default, and the operator stops it with `Ctrl+C`.

`make desktop-dev` runs `pnpm run dev:web` for client plugin watch builds. It does not replace the Web server.

`make help` lists the supported targets.

## Failure Behavior

The Makefile stops before installation when Node.js, Corepack, or a compatible Node.js version is unavailable. Dependency, build, and server failures retain their command output and exit status.

## Scope and Verification

The change adds only the root Makefile and does not modify runtime packages, manage background processes, open a browser, or store credentials. Verification checks Make parsing and the version guard, runs `make install`, starts `make desktop`, waits for `http://127.0.0.1:3080` to respond, and terminates the foreground process.

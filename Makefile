APP_PATH ?= /Applications/DeepSeek Harness.app
PLUGIN ?= mail
PROFILE ?= web
DESKTOP_DSH_HOME ?= $(HOME)/Library/Application Support/ai.deepseek.harness/harness
RELEASE_CACHE ?= $(CURDIR)/.cache/release

ifneq ($(filter release-dmg release-check release-dependencies download-runtime stage-runtime,$(MAKECMDGOALS)),)
RUNTIME_CONFIG := $(CURDIR)/apps/desktop/runtime.json
NODE_ARCHIVE_NAME := $(shell node -p "require('$(RUNTIME_CONFIG)').archive")
NODE_ARCHIVE_URL := $(shell node -p "require('$(RUNTIME_CONFIG)').url")
NODE_ARCHIVE_SHA256 := $(shell node -p "require('$(RUNTIME_CONFIG)').sha256")
NODE_ARCHIVE ?= $(RELEASE_CACHE)/$(NODE_ARCHIVE_NAME)
RUST_TARGET := aarch64-apple-darwin
endif

RUNTIME := $(APP_PATH)/Contents/Resources/runtime
NODE := $(RUNTIME)/node/bin/node
DSH_CLI := $(RUNTIME)/app/node_modules/@deepseek-ai/dsh/lib/bin.js
PACKAGE_BIN := $(RUNTIME)/app/node_modules/.bin
MAIL_RELEASE := $(CURDIR)/plugins/mail/scripts/pack-release.mjs
MAIL_INSTALL := $(CURDIR)/plugins/mail/scripts/install-release.mjs

ifneq ($(filter pack-plugin install-plugin,$(MAKECMDGOALS)),)
ifeq ($(PLUGIN),mail)
PLUGIN_PACKAGE := dsh-mail
else ifeq ($(PLUGIN),wecom)
PLUGIN_PACKAGE := dsh-wecom
PLUGIN_PACK_SCRIPT := wecom:pack
else ifeq ($(PLUGIN),confluence)
PLUGIN_PACKAGE := dsh-confluence
PLUGIN_PACK_SCRIPT := confluence:pack
else ifeq ($(PLUGIN),manager)
PLUGIN_PACKAGE := dsh-plugin-manager
PLUGIN_PACK_SCRIPT := manager:pack
else ifeq ($(PLUGIN),nextcloud)
PLUGIN_PACKAGE := dsh-nextcloud
PLUGIN_PACK_SCRIPT := nextcloud:pack
else
$(error unsupported PLUGIN=$(PLUGIN); supported plugins: mail wecom confluence manager nextcloud)
endif
ifneq ($(PLUGIN),mail)
PLUGIN_VERSION := $(shell node -p "require('./plugins/$(PLUGIN)/package.json').version")
PLUGIN_ARCHIVE := $(CURDIR)/plugins/$(PLUGIN)/$(PLUGIN_PACKAGE)-$(PLUGIN_VERSION).tgz
endif
endif

.PHONY: help release-dmg release-check release-dependencies download-runtime stage-runtime run pack-plugin install-plugin

help:
	@printf '%s\n' \
		'make release-dmg    Install, stage, build, and audit the release app and DMG' \
		'make run            Start Tauri development mode' \
		'make pack-plugin    Build a production plugin tgz (PLUGIN=mail|wecom|confluence|manager|nextcloud)' \
		'make install-plugin Pack and install a plugin into the Desktop web profile' \
		'' \
		'Variables: NODE_ARCHIVE, RELEASE_CACHE, APP_PATH, PLUGIN=mail|wecom|confluence|manager|nextcloud, PROFILE=web, DESKTOP_DSH_HOME'

release-dmg: stage-runtime
	corepack pnpm desktop:build

release-check:
	@set -eu; \
	if [ "$$(uname -s)" != Darwin ] || [ "$$(uname -m)" != arm64 ]; then \
		printf '%s\n' 'release-dmg requires an Apple Silicon Mac' >&2; exit 1; \
	fi; \
	for command in node corepack cargo rustup curl shasum hdiutil osascript codesign git tar xcrun; do \
		command -v "$$command" >/dev/null || { printf 'missing required command: %s\n' "$$command" >&2; exit 1; }; \
	done; \
	rustup target list --installed | grep -Fx '$(RUST_TARGET)' >/dev/null || { \
		printf 'missing Rust target: %s (install with: rustup target add %s)\n' '$(RUST_TARGET)' '$(RUST_TARGET)' >&2; exit 1; \
	}

release-dependencies: release-check
	corepack pnpm install --frozen-lockfile

download-runtime: release-check
	@set -eu; \
	mkdir -p "$$(dirname "$(NODE_ARCHIVE)")"; \
	if [ -f "$(NODE_ARCHIVE)" ] && printf '%s  %s\n' '$(NODE_ARCHIVE_SHA256)' "$(NODE_ARCHIVE)" | shasum -a 256 -c - >/dev/null 2>&1; then \
		printf 'using cached Node runtime: %s\n' '$(NODE_ARCHIVE)'; \
	else \
		temporary="$(NODE_ARCHIVE).tmp.$$$$"; \
		trap 'rm -f "$$temporary"' EXIT HUP INT TERM; \
		printf 'downloading Node runtime: %s\n' '$(NODE_ARCHIVE_URL)'; \
		curl --fail --location --retry 3 --output "$$temporary" '$(NODE_ARCHIVE_URL)'; \
		printf '%s  %s\n' '$(NODE_ARCHIVE_SHA256)' "$$temporary" | shasum -a 256 -c -; \
		mv "$$temporary" "$(NODE_ARCHIVE)"; \
		trap - EXIT HUP INT TERM; \
	fi

stage-runtime: release-dependencies download-runtime
	NODE_ARCHIVE="$(NODE_ARCHIVE)" corepack pnpm desktop:stage -- --archive "$(NODE_ARCHIVE)"

run:
	corepack pnpm --dir apps/desktop dev

pack-plugin:
ifeq ($(PLUGIN),mail)
	@test -x "$(NODE)" || { printf 'missing bundled Node: %s\n' "$(NODE)" >&2; exit 1; }
	@test -x "$(PACKAGE_BIN)/pnpm" || { printf 'missing bundled pnpm: %s\n' "$(PACKAGE_BIN)/pnpm" >&2; exit 1; }
	NODE_PATH= NODE_OPTIONS= "$(NODE)" "$(MAIL_RELEASE)" \
		--pnpm "$(PACKAGE_BIN)/pnpm" --destination "$(CURDIR)/plugins/mail"
else
	corepack pnpm --dir plugins/$(PLUGIN) install --frozen-lockfile
	corepack pnpm $(PLUGIN_PACK_SCRIPT)
endif

install-plugin: pack-plugin
	@test -x "$(NODE)" || { printf 'missing bundled Node: %s\n' "$(NODE)" >&2; exit 1; }
	@test -f "$(DSH_CLI)" || { printf 'missing bundled dsh CLI: %s\n' "$(DSH_CLI)" >&2; exit 1; }
	@test -x "$(PACKAGE_BIN)/pnpm" || { printf 'missing bundled pnpm: %s\n' "$(PACKAGE_BIN)/pnpm" >&2; exit 1; }
	@printf '%s\n' 'Quit DeepSeek Harness before installing to avoid concurrent profile access.'
ifeq ($(PLUGIN),mail)
	@PLUGIN_VERSION="$$("$(NODE)" "$(MAIL_RELEASE)" --version)"; \
	PLUGIN_ARCHIVE="$(CURDIR)/plugins/mail/dsh-mail-$$PLUGIN_VERSION.tgz"; \
	test -f "$$PLUGIN_ARCHIVE" || { printf 'missing plugin archive: %s\n' "$$PLUGIN_ARCHIVE" >&2; exit 1; }; \
	NODE_PATH= NODE_OPTIONS= "$(NODE)" "$(MAIL_INSTALL)" \
		--cli "$(DSH_CLI)" --package-bin "$(PACKAGE_BIN)" \
		--profile "$(PROFILE)" --dsh-home "$(DESKTOP_DSH_HOME)" --archive "$$PLUGIN_ARCHIVE"
else
	@test -f "$(PLUGIN_ARCHIVE)" || { printf 'missing plugin archive: %s\n' "$(PLUGIN_ARCHIVE)" >&2; exit 1; }
	DSH_HOME="$(DESKTOP_DSH_HOME)" \
	PATH="$(RUNTIME)/node/bin:$(PACKAGE_BIN):/usr/bin:/bin" \
	"$(NODE)" "$(DSH_CLI)" plugin --profile "$(PROFILE)" add "$(PLUGIN_ARCHIVE)"
endif

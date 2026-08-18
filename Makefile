APP_PATH ?= /Applications/DeepSeek Harness.app
PLUGIN ?= mail
PROFILE ?= web
DESKTOP_DSH_HOME ?= $(HOME)/Library/Application Support/ai.deepseek.harness/harness

RUNTIME := $(APP_PATH)/Contents/Resources/runtime
NODE := $(RUNTIME)/node/bin/node
DSH_CLI := $(RUNTIME)/app/node_modules/@deepseek-ai/dsh/lib/bin.js
PACKAGE_BIN := $(RUNTIME)/app/node_modules/.bin
MAIL_PLUGIN_VERSION := $(shell node -p "require('./plugins/mail/package.json').version")
PLUGIN_ARCHIVE := $(CURDIR)/plugins/mail/dsh-mail-plugin-$(MAIL_PLUGIN_VERSION).tgz

ifneq ($(filter pack-plugin install-plugin,$(MAKECMDGOALS)),)
ifneq ($(PLUGIN),mail)
$(error unsupported PLUGIN=$(PLUGIN); supported plugins: mail)
endif
endif

.PHONY: help release-dmg run pack-plugin install-plugin

help:
	@printf '%s\n' \
		'make release-dmg    Build and audit the release app and DMG' \
		'make run            Start Tauri development mode' \
		'make pack-plugin    Build the production mail plugin tgz' \
		'make install-plugin Pack and install mail into the Desktop web profile' \
		'' \
		'Variables: APP_PATH, PLUGIN=mail, PROFILE=web, DESKTOP_DSH_HOME'

release-dmg:
	corepack pnpm desktop:build

run:
	corepack pnpm --dir apps/desktop dev

pack-plugin:
	corepack pnpm mail:pack

install-plugin: pack-plugin
	@test -x "$(NODE)" || { printf 'missing bundled Node: %s\n' "$(NODE)" >&2; exit 1; }
	@test -f "$(DSH_CLI)" || { printf 'missing bundled dsh CLI: %s\n' "$(DSH_CLI)" >&2; exit 1; }
	@test -x "$(PACKAGE_BIN)/pnpm" || { printf 'missing bundled pnpm: %s\n' "$(PACKAGE_BIN)/pnpm" >&2; exit 1; }
	@test -f "$(PLUGIN_ARCHIVE)" || { printf 'missing plugin archive: %s\n' "$(PLUGIN_ARCHIVE)" >&2; exit 1; }
	@printf '%s\n' 'Quit DeepSeek Harness before installing to avoid concurrent profile access.'
	DSH_HOME="$(DESKTOP_DSH_HOME)" \
	PATH="$(RUNTIME)/node/bin:$(PACKAGE_BIN):/usr/bin:/bin" \
	"$(NODE)" "$(DSH_CLI)" plugin --profile "$(PROFILE)" add "$(PLUGIN_ARCHIVE)"

APP_PATH ?= /Applications/DeepSeek Harness.app
PLUGIN ?= mail
PROFILE ?= web
DESKTOP_DSH_HOME ?= $(HOME)/Library/Application Support/ai.deepseek.harness/harness

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
else
$(error unsupported PLUGIN=$(PLUGIN); supported plugins: mail wecom)
endif
ifneq ($(PLUGIN),mail)
PLUGIN_VERSION := $(shell node -p "require('./plugins/$(PLUGIN)/package.json').version")
PLUGIN_ARCHIVE := $(CURDIR)/plugins/$(PLUGIN)/$(PLUGIN_PACKAGE)-$(PLUGIN_VERSION).tgz
endif
endif

.PHONY: help release-dmg run pack-plugin install-plugin

help:
	@printf '%s\n' \
		'make release-dmg    Build and audit the release app and DMG' \
		'make run            Start Tauri development mode' \
		'make pack-plugin    Build a production plugin tgz (PLUGIN=mail|wecom)' \
		'make install-plugin Pack and install a plugin into the Desktop web profile' \
		'' \
		'Variables: APP_PATH, PLUGIN=mail|wecom, PROFILE=web, DESKTOP_DSH_HOME'

release-dmg:
	corepack pnpm desktop:build

run:
	corepack pnpm --dir apps/desktop dev

pack-plugin:
ifeq ($(PLUGIN),mail)
	@test -x "$(NODE)" || { printf 'missing bundled Node: %s\n' "$(NODE)" >&2; exit 1; }
	@test -x "$(PACKAGE_BIN)/pnpm" || { printf 'missing bundled pnpm: %s\n' "$(PACKAGE_BIN)/pnpm" >&2; exit 1; }
	NODE_PATH= NODE_OPTIONS= "$(NODE)" "$(MAIL_RELEASE)" \
		--pnpm "$(PACKAGE_BIN)/pnpm" --destination "$(CURDIR)/plugins/mail"
else
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

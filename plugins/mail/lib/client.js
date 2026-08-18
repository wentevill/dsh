window.__ModuleLoader__.load({
	id: "dsh-mail-plugin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		//#region src/client/card-css.ts
		/**
		* Self-contained card chrome styling for the mail plugin configuration card.
		*
		* The reference plugin cards (Shell, Agent loop, Web search) ship their styling
		* as CSS modules compiled into the web shell with content-hashed class names.
		* An external client bundle cannot reuse those hashed names without re-running
		* the identical lightningcss pipeline, so this bundle instead owns its own
		* prefixed copy of the same rules. Every selector is namespaced (`dlm_`) to
		* avoid colliding with the shell's unhashed globals, and the rules read the
		* shell's global `--dsw-alias-*` design tokens, so the card renders natively.
		*
		* The stylesheet is injected once per document via a guarded <style> tag.
		*/
		/** Namespace prefix for every card class. */
		const P = "dlm";
		/** Class map the vendored card components reference as `css.<local>`. */
		const css = {
			card: `${P}_card`,
			cardOpen: `${P}_cardOpen`,
			header: `${P}_header`,
			headText: `${P}_headText`,
			name: `${P}_name`,
			description: `${P}_description`,
			chevron: `${P}_chevron`,
			chevronOpen: `${P}_chevronOpen`,
			body: `${P}_body`,
			readOnly: `${P}_readOnly`,
			pending: `${P}_pending`,
			footer: `${P}_footer`,
			failed: `${P}_failed`,
			discard: `${P}_discard`,
			save: `${P}_save`,
			field: `${P}_field`,
			head: `${P}_head`,
			label: `${P}_label`,
			badges: `${P}_badges`,
			badge: `${P}_badge`,
			badgeMuted: `${P}_badgeMuted`,
			reset: `${P}_reset`,
			input: `${P}_input`,
			inputInvalid: `${P}_inputInvalid`,
			invalid: `${P}_invalid`,
			hint: `${P}_hint`,
			check: `${P}_check`,
			checkbox: `${P}_checkbox`,
			checkLabel: `${P}_checkLabel`
		};
		const STYLE = `
.${css.card}{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);transition:border-color .16s,background .16s}
.${css.card}:hover{border-color:var(--dsw-alias-label-dimmed)}
.${css.cardOpen}{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.${css.header}{width:100%;appearance:none;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px}
.${css.header}:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.${css.headText}{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.${css.name}{font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary)}
.${css.description}{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.${css.chevron}{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}
.${css.chevronOpen}{transform:rotate(180deg)}
.${css.body}{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}
.${css.readOnly}{margin:12px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.${css.pending}{flex:none;border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px;font-weight:500;white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
.${css.footer}{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 0 4px;border-top:1px solid var(--dsw-alias-border-l2)}
.${css.failed}{flex:1;min-width:0;margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error)}
.${css.discard},.${css.save}{appearance:none;border:1px solid transparent;border-radius:8px;padding:5px 14px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}
.${css.discard}{border-color:var(--dsw-alias-border-l2);background:none;color:var(--dsw-alias-label-secondary)}
.${css.discard}:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}
.${css.save}{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.${css.discard}:disabled,.${css.save}:disabled{opacity:.4;cursor:default}
.${css.discard}:focus-visible,.${css.save}:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.${css.field}{display:flex;flex-direction:column;gap:6px;padding:12px 0}
.${css.field}+.${css.field}{border-top:1px solid var(--dsw-alias-border-l2)}
.${css.head}{display:flex;align-items:center;gap:8px}
.${css.label}{flex:1;min-width:0;font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary)}
.${css.badges}{display:inline-flex;align-items:center;gap:8px}
.${css.badge}{border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px;white-space:nowrap;font-weight:500;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
.${css.badgeMuted}{border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px;white-space:nowrap;color:var(--dsw-alias-label-tertiary)}
.${css.reset}{border:none;background:none;padding:0;font:inherit;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary);cursor:pointer}
.${css.reset}:hover:not(:disabled){color:var(--dsw-alias-label-primary)}
.${css.reset}:disabled{cursor:default}
.${css.input}{height:34px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px}
.${css.input}:focus-visible{outline:none;border-color:var(--dsw-alias-brand-primary)}
.${css.input}:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}
.${css.inputInvalid}{height:34px;padding:0 12px;border:1px solid var(--dsw-alias-label-error);border-radius:8px;background:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}
.${css.invalid}{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error)}
.${css.hint}{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.${css.check}{display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500}
.${css.checkbox}{width:16px;height:16px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.${css.checkbox}:disabled{cursor:default;opacity:.5}
.${css.checkLabel}{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary)}
`;
		let injected = false;
		/** Inject the card stylesheet once. Safe to call from any component render. */
		function ensureCardCSS() {
			if (injected || typeof document === "undefined") return;
			injected = true;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-mail-plugin";
			tag.dataset.pluginCss = "dsh-mail-plugin/card";
			tag.textContent = STYLE;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/PluginCard.tsx
		/**
		* One plugin's card: a header naming the plugin and what its settings govern,
		* disclosing that plugin's controls in place, with the save that writes them.
		*
		* Vendored from the reference `ui-settings-plugins/src/client/PluginCard.tsx`
		* (same markup + behavior) but sourcing its class names from this bundle's own
		* prefixed stylesheet, so an external client needs none of the web shell's
		* content-hashed CSS-module names.
		*/
		/** Render one plugin card. */
		function PluginCard(props) {
			const [open, setOpen] = (0, react.useState)(false);
			ensureCardCSS();
			const { state } = props;
			if (!state.available) return null;
			const title = props.t(props.titleKey);
			const blocked = !state.dirty || state.invalid || state.saving;
			const cardCls = open ? `${css.card} ${css.cardOpen}` : css.card;
			const chevronCls = open ? `${css.chevron} ${css.chevronOpen}` : css.chevron;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: cardCls,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: css.header,
					"aria-expanded": open,
					"aria-label": `${props.t(open ? "collapse" : "expand")}: ${title}`,
					onClick: () => {
						setOpen(!open);
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: css.headText,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: css.name,
								children: title
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: css.description,
								children: props.t(props.descriptionKey)
							})]
						}),
						state.dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: css.pending,
							children: props.t("unsaved")
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: chevronCls })
					]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: css.body,
					children: [
						!state.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: css.readOnly,
							role: "status",
							children: props.t("readOnly")
						}) : null,
						props.children,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: css.footer,
							children: [
								state.failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: css.failed,
									role: "status",
									children: props.t("saveFailed")
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: css.discard,
									disabled: !state.dirty || state.saving,
									onClick: props.onDiscard,
									children: props.t("discard")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: css.save,
									disabled: blocked,
									onClick: props.onSave,
									children: props.t(state.saving ? "saving" : "save")
								})
							]
						})
					]
				}) : null]
			});
		}
		//#endregion
		//#region src/client/fields.tsx
		/**
		* Hand-written controls for the plugin configuration form (vendored from the
		* reference `ui-settings-plugins/src/client/fields.tsx`, class names sourced
		* from this bundle's own prefixed stylesheet).
		*/
		/** A staged value field; `numeric` hints a numeric keypad without narrowing input. */
		function ValueField(props) {
			ensureCardCSS();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: css.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: css.head,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: css.label,
							htmlFor: props.id,
							children: props.label
						}), props.overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: css.badges,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: css.badge,
								children: props.overriddenLabel
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: css.reset,
								disabled: props.disabled,
								onClick: props.onReset,
								children: props.resetLabel
							})]
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id: props.id,
						className: props.invalid ? css.inputInvalid : css.input,
						type: "text",
						...props.numeric === true ? { inputMode: "numeric" } : {},
						...props.invalid ? { "aria-invalid": true } : {},
						value: props.text,
						placeholder: props.placeholder ?? "",
						disabled: props.disabled,
						onChange: (event) => {
							props.onEdit(event.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: props.invalid ? css.invalid : css.hint,
						children: props.invalid ? props.invalidLabel : props.hint
					})
				]
			});
		}
		/** A write-only credential control; the value never rides a response. */
		function SecretField(props) {
			ensureCardCSS();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: css.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: css.head,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
							className: css.label,
							htmlFor: props.id,
							children: props.label
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: css.badges,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: props.configured ? css.badge : css.badgeMuted,
								children: props.stateLabel
							})
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id: props.id,
						className: css.input,
						type: "password",
						autoComplete: "off",
						value: props.text,
						disabled: props.disabled,
						onChange: (event) => {
							props.onEdit(event.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: css.hint,
						children: props.hint
					})
				]
			});
		}
		/** A boolean control rendered as a labelled checkbox. */
		function CheckField(props) {
			ensureCardCSS();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: css.field,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
					className: css.check,
					htmlFor: props.id,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id: props.id,
						className: css.checkbox,
						type: "checkbox",
						checked: props.checked,
						disabled: props.disabled,
						onChange: (event) => {
							props.onToggle(event.target.checked);
						}
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: css.checkLabel,
						children: props.label
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: css.hint,
					children: props.hint
				})]
			});
		}
		//#endregion
		//#region src/client/MailCard.tsx
		function MailCard(props) {
			const { t } = props;
			const state = props.useMailCard((s) => s);
			const readT = t;
			const disabled = !state.writable;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(PluginCard, {
				t: readT,
				titleKey: "mailTitle",
				descriptionKey: "mailDescription",
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ValueField, {
						id: "mail-username",
						label: readT("mailUsername"),
						hint: readT("mailUsernameHint"),
						text: state.username.text,
						overridden: state.username.overridden,
						invalid: state.username.invalid,
						overriddenLabel: readT("overridden"),
						resetLabel: readT("reset"),
						invalidLabel: readT("invalidText"),
						placeholder: "you@example.com",
						disabled,
						onEdit: (v) => props.edit("username", v),
						onReset: () => props.resetField("username")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ValueField, {
						id: "mail-mailbox",
						label: readT("mailMailbox"),
						hint: readT("mailMailboxHint"),
						text: state.mailbox.text,
						overridden: state.mailbox.overridden,
						invalid: state.mailbox.invalid,
						overriddenLabel: readT("overridden"),
						resetLabel: readT("reset"),
						invalidLabel: readT("invalidText"),
						placeholder: "INBOX",
						disabled,
						onEdit: (v) => props.edit("mailbox", v),
						onReset: () => props.resetField("mailbox")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ValueField, {
						id: "mail-imap-host",
						label: readT("mailImapHost"),
						hint: readT("mailImapHostHint"),
						text: state.imapHost.text,
						overridden: state.imapHost.overridden,
						invalid: state.imapHost.invalid,
						overriddenLabel: readT("overridden"),
						resetLabel: readT("reset"),
						invalidLabel: readT("invalidText"),
						disabled,
						onEdit: (v) => props.edit("imapHost", v),
						onReset: () => props.resetField("imapHost")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ValueField, {
						id: "mail-imap-port",
						label: readT("mailImapPort"),
						hint: readT("mailImapPortHint"),
						numeric: true,
						text: state.imapPort.text,
						overridden: state.imapPort.overridden,
						invalid: state.imapPort.invalid,
						overriddenLabel: readT("overridden"),
						resetLabel: readT("reset"),
						invalidLabel: readT("invalidNumber"),
						disabled,
						onEdit: (v) => props.edit("imapPort", v),
						onReset: () => props.resetField("imapPort")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CheckField, {
						id: "mail-imap-secure",
						label: readT("mailImapSecure"),
						hint: readT("mailImapSecureHint"),
						checked: state.imapSecure.text === "true",
						disabled,
						onToggle: (c) => props.edit("imapSecure", c ? "true" : "false")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ValueField, {
						id: "mail-smtp-host",
						label: readT("mailSmtpHost"),
						hint: readT("mailSmtpHostHint"),
						text: state.smtpHost.text,
						overridden: state.smtpHost.overridden,
						invalid: state.smtpHost.invalid,
						overriddenLabel: readT("overridden"),
						resetLabel: readT("reset"),
						invalidLabel: readT("invalidText"),
						disabled,
						onEdit: (v) => props.edit("smtpHost", v),
						onReset: () => props.resetField("smtpHost")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ValueField, {
						id: "mail-smtp-port",
						label: readT("mailSmtpPort"),
						hint: readT("mailSmtpPortHint"),
						numeric: true,
						text: state.smtpPort.text,
						overridden: state.smtpPort.overridden,
						invalid: state.smtpPort.invalid,
						overriddenLabel: readT("overridden"),
						resetLabel: readT("reset"),
						invalidLabel: readT("invalidNumber"),
						disabled,
						onEdit: (v) => props.edit("smtpPort", v),
						onReset: () => props.resetField("smtpPort")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CheckField, {
						id: "mail-smtp-secure",
						label: readT("mailSmtpSecure"),
						hint: readT("mailSmtpSecureHint"),
						checked: state.smtpSecure.text === "true",
						disabled,
						onToggle: (c) => props.edit("smtpSecure", c ? "true" : "false")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SecretField, {
						id: "mail-password",
						label: readT("mailPassword"),
						hint: readT("mailPasswordHint"),
						text: state.password.text,
						disabled: !state.passwordWritable,
						configured: state.passwordConfigured,
						stateLabel: state.passwordConfigured ? readT("mailPasswordSet") : readT("mailPasswordUnset"),
						onEdit: (v) => props.edit("password", v)
					})
				]
			});
		}
		//#endregion
		//#region src/client/mail-card-controller.ts
		/**
		* Mail card controller over the nested `mail` settings scope, shaped to drive
		* the shared plugin-card chrome (PluginCard + ValueField + SecretField).
		*
		* The namespace section is nested (`imap.{host,port,secure}`, `smtp.{…}`);
		* this controller stages flat drafts and, on save, writes them back into the
		* nested section through the client scope's single-key `set` (whole-group
		* writes for `imap`/`smtp`). The password is the one control that never rides
		* a response: it is written through the credentials domain under the fixed
		* `MAIL_APP_PASSWORD` reference.
		*/
		/** The section namespace key this card edits. */
		const MAIL_NS = "mail";
		/** The credential reference the password always lives under. */
		const PASSWORD_REF = "MAIL_APP_PASSWORD";
		function scalar(snap, key) {
			return snap.value?.[key];
		}
		function nested(snap, group, key) {
			return (snap.value?.[group])?.[key];
		}
		function storedScalar(snap, key) {
			const user = snap.user;
			return user !== void 0 && Object.prototype.hasOwnProperty.call(user, key);
		}
		function storedGroup(snap, group) {
			const user = snap.user;
			return user !== void 0 && user[group] !== void 0;
		}
		function isValidPort(text) {
			if (text.trim() === "") return true;
			const n = Number(text);
			return Number.isInteger(n) && n >= 1 && n <= 65535;
		}
		const TEXT_FIELDS = new Set([
			"username",
			"mailbox",
			"imapHost",
			"smtpHost"
		]);
		const PORT_FIELDS = new Set(["imapPort", "smtpPort"]);
		const SECURE_FIELDS = new Set(["imapSecure", "smtpSecure"]);
		const isFlat = (field) => field === "password" || TEXT_FIELDS.has(field) || PORT_FIELDS.has(field) || SECURE_FIELDS.has(field);
		/**
		* Build the mail card controller.
		* @param scope - the bound settings scope for the `mail` namespace.
		* @param api - wire face used for the password credential.
		* @param available - true once the namespace is served to this client.
		* @returns the snapshot store, injected face, and a credential invalidation hook.
		*/
		function createMailCardController(scope, api, available) {
			const drafts = /* @__PURE__ */ new Map();
			const credential = {
				configured: false,
				writable: true
			};
			let saving = false;
			let failed = false;
			const valueOf = (snap, field) => {
				const d = drafts.get(field);
				if (d !== void 0) return d;
				const raw = field === "imapHost" ? nested(snap, "imap", "host") : field === "imapPort" ? nested(snap, "imap", "port") : field === "imapSecure" ? nested(snap, "imap", "secure") : field === "smtpHost" ? nested(snap, "smtp", "host") : field === "smtpPort" ? nested(snap, "smtp", "port") : field === "smtpSecure" ? nested(snap, "smtp", "secure") : scalar(snap, field);
				if (PORT_FIELDS.has(field)) return typeof raw === "number" ? String(raw) : "";
				if (SECURE_FIELDS.has(field)) return raw === true ? "true" : "false";
				return typeof raw === "string" ? raw : "";
			};
			const fieldState = (snap, field) => {
				const staged = drafts.get(field);
				if (staged !== void 0) {
					const invalid = PORT_FIELDS.has(field) ? !isValidPort(staged) : false;
					const w = staged.trim();
					return {
						text: staged,
						overridden: SECURE_FIELDS.has(field) ? w === "true" || w === "false" : w !== "" && !invalid,
						invalid
					};
				}
				const stored = SECURE_FIELDS.has(field) ? storedGroup(snap, field === "imapSecure" ? "imap" : "smtp") : field === "imapHost" || field === "imapPort" ? storedGroup(snap, "imap") : field === "smtpHost" || field === "smtpPort" ? storedGroup(snap, "smtp") : storedScalar(snap, field);
				return {
					text: valueOf(snap, field),
					overridden: stored,
					invalid: false
				};
			};
			const project = () => {
				const snap = scope.getSnapshot();
				const planInvalid = [...PORT_FIELDS].some((f) => drafts.has(f) && !isValidPort(drafts.get(f)));
				return {
					available,
					writable: snap.writable,
					dirty: drafts.size > 0,
					invalid: planInvalid,
					saving,
					failed,
					username: fieldState(snap, "username"),
					mailbox: fieldState(snap, "mailbox"),
					imapHost: fieldState(snap, "imapHost"),
					imapPort: fieldState(snap, "imapPort"),
					imapSecure: fieldState(snap, "imapSecure"),
					smtpHost: fieldState(snap, "smtpHost"),
					smtpPort: fieldState(snap, "smtpPort"),
					smtpSecure: fieldState(snap, "smtpSecure"),
					password: {
						text: drafts.get("password") ?? "",
						overridden: false,
						invalid: false
					},
					passwordConfigured: credential.configured,
					passwordWritable: credential.writable
				};
			};
			const store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(project());
			const publish = () => {
				store.set(project());
			};
			scope.subscribe(publish);
			async function readCredential() {
				try {
					const response = await api.credentials.describe({ refs: [PASSWORD_REF] });
					if (!response.result.ok) return;
					const view = response.result.value.credentials[PASSWORD_REF];
					const next = {
						configured: view?.configured ?? false,
						writable: view?.writable ?? true
					};
					if (next.configured === credential.configured && next.writable === credential.writable) return;
					credential.configured = next.configured;
					credential.writable = next.writable;
					publish();
				} catch {}
			}
			async function save() {
				if (saving) return;
				saving = true;
				failed = false;
				publish();
				let landed = true;
				try {
					const snap = scope.getSnapshot();
					const confirmed = (field, value) => {
						const user = scope.getSnapshot().user;
						return user !== void 0 && Object.prototype.hasOwnProperty.call(user, field) && JSON.stringify(user[field]) === JSON.stringify(value);
					};
					const write = async (field, value) => {
						for (let attempt = 0; attempt < 2; attempt += 1) {
							await scope.set(field, value);
							if (confirmed(field, value)) return;
						}
						landed = false;
					};
					const str = (field, fallback) => {
						const d = drafts.get(field);
						return d !== void 0 ? d.trim() : fallback;
					};
					const portNum = (field) => {
						const d = drafts.get(field);
						if (d !== void 0) {
							const n = Number(d.trim());
							return Number.isInteger(n) && isValidPort(d.trim()) ? n : 0;
						}
						const v = field === "imapPort" ? nested(snap, "imap", "port") : nested(snap, "smtp", "port");
						return typeof v === "number" ? v : 0;
					};
					const secureOf = (field) => {
						const d = drafts.get(field);
						if (d !== void 0) return d === "true";
						return (field === "imapSecure" ? nested(snap, "imap", "secure") : nested(snap, "smtp", "secure")) === true;
					};
					const hostOf = (field) => {
						const d = drafts.get(field);
						if (d !== void 0) return d.trim();
						const v = field === "imapHost" ? nested(snap, "imap", "host") : nested(snap, "smtp", "host");
						return typeof v === "string" ? v : "";
					};
					if (drafts.has("username")) await write("username", str("username", ""));
					if (drafts.has("mailbox")) await write("mailbox", str("mailbox", "INBOX") || "INBOX");
					if (["imapHost", "imapPort", "imapSecure"].some((field) => drafts.has(field))) await write("imap", {
						host: hostOf("imapHost"),
						port: portNum("imapPort"),
						secure: secureOf("imapSecure")
					});
					if (["smtpHost", "smtpPort", "smtpSecure"].some((field) => drafts.has(field))) await write("smtp", {
						host: hostOf("smtpHost"),
						port: portNum("smtpPort"),
						secure: secureOf("smtpSecure")
					});
					const pw = drafts.get("password")?.trim();
					if (pw) try {
						await api.credentials.set({
							ref: PASSWORD_REF,
							value: pw
						});
					} catch {}
					await readCredential();
				} catch {
					landed = false;
				}
				if (landed) drafts.clear();
				saving = false;
				failed = !landed;
				publish();
			}
			const actions = {
				edit: (field, text) => {
					if (!isFlat(field)) return;
					drafts.set(field, text);
					failed = false;
					publish();
				},
				resetField: (field) => {
					if (!isFlat(field)) return;
					drafts.delete(field);
					failed = false;
					publish();
				},
				save: () => {
					save();
				},
				discard: () => {
					if (drafts.size === 0 && !failed) return;
					drafts.clear();
					failed = false;
					publish();
				}
			};
			const face = () => ({
				hooks: { mailCard: store },
				...actions
			});
			const refreshCredential = () => {
				readCredential();
			};
			readCredential();
			return {
				store,
				face,
				refreshCredential
			};
		}
		//#endregion
		//#region src/client/locales.ts
		/** Copy dictionaries for the mail card (en/zh). */
		const en = {
			collapse: "Hide settings",
			expand: "Show settings",
			unsaved: "Unsaved",
			readOnly: "This deployment stores settings read-only.",
			saveFailed: "The deployment did not accept these values; they were left for you to correct.",
			discard: "Discard",
			save: "Save",
			saving: "Saving…",
			overridden: "Overridden",
			reset: "Reset to default",
			invalidText: "Enter a value, or leave blank to use the default.",
			invalidNumber: "Enter a number, or leave blank to use the default.",
			mailTitle: "Mail (SMTP / IMAP)",
			mailDescription: "Configure the account used to receive and send email; the password lives in key management.",
			mailUsername: "Email account",
			mailUsernameHint: "The mailbox whose mail is read and on whose behalf mail is sent.",
			mailMailbox: "Mailbox",
			mailMailboxHint: "IMAP folder to read, normally INBOX.",
			mailImapHost: "IMAP server",
			mailImapHostHint: "The IMAP receive server.",
			mailImapPort: "IMAP port",
			mailImapPortHint: "Usually 993 for a secure connection.",
			mailImapSecure: "Use a secure connection",
			mailImapSecureHint: "Connect with TLS/SSL for IMAP.",
			mailSmtpHost: "SMTP server",
			mailSmtpHostHint: "The SMTP send server.",
			mailSmtpPort: "SMTP port",
			mailSmtpPortHint: "Usually 465 for a secure connection.",
			mailSmtpSecure: "Use a secure connection",
			mailSmtpSecureHint: "Connect with TLS/SSL for SMTP.",
			mailPassword: "Application password",
			mailPasswordHint: "Stored in key management under MAIL_APP_PASSWORD, never in configuration. Leave blank to keep the current one.",
			mailPasswordSet: "Configured in key management",
			mailPasswordUnset: "No password stored yet"
		};
		const zh = {
			collapse: "收起设置",
			expand: "展开设置",
			unsaved: "未保存",
			readOnly: "本部署的设置为只读。",
			saveFailed: "本部署没有接受这些值，已保留供你修改。",
			discard: "放弃修改",
			save: "保存",
			saving: "保存中…",
			overridden: "已覆盖",
			reset: "恢复默认",
			invalidText: "请填写内容；留空表示使用默认值。",
			invalidNumber: "请填数字；留空表示使用默认值。",
			mailTitle: "邮件（SMTP / IMAP）",
			mailDescription: "配置用于收发邮件的账号；密码保存在密钥管理中。",
			mailUsername: "邮箱账号",
			mailUsernameHint: "用于读取收件箱，并以此身份发送邮件。",
			mailMailbox: "邮箱",
			mailMailboxHint: "要读取的 IMAP 文件夹，通常为 INBOX。",
			mailImapHost: "IMAP 服务器",
			mailImapHostHint: "接收邮件的 IMAP 服务器。",
			mailImapPort: "IMAP 端口",
			mailImapPortHint: "安全连接通常为 993。",
			mailImapSecure: "使用安全连接",
			mailImapSecureHint: "IMAP 使用 TLS/SSL 加密连接。",
			mailSmtpHost: "SMTP 服务器",
			mailSmtpHostHint: "发送邮件的 SMTP 服务器。",
			mailSmtpPort: "SMTP 端口",
			mailSmtpPortHint: "安全连接通常为 465。",
			mailSmtpSecure: "使用安全连接",
			mailSmtpSecureHint: "SMTP 使用 TLS/SSL 加密连接。",
			mailPassword: "应用密码",
			mailPasswordHint: "保存在密钥管理（MAIL_APP_PASSWORD），不写入配置。留空表示保持当前密码。",
			mailPasswordSet: "已在密钥管理中配置",
			mailPasswordUnset: "尚未存储密码"
		};
		//#endregion
		//#region src/client/index.ts
		/** Copy namespace owned by this client plugin. */
		const NS = "settings.plugins.mail";
		const name = "mail-plugin-client";
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"settingsScope"
		];
		function apply(ctx) {
			const { api } = ctx.get("connection");
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "mail-plugin-client: dictionaries");
			const controller = createMailCardController(ctx.settingsScope.bind({ namespace: MAIL_NS }), api, true);
			ctx.effect(() => ctx.remote.$on("credentials/updated", () => {
				controller.refreshCredential();
			}), "mail-plugin-client: credential invalidations");
			ctx.slots.inject("settings.plugin.item", function* () {
				yield ctx.slots.register({
					name: "settings.plugin.item",
					id: "mail",
					order: 30,
					locale: NS,
					inject: controller.face
				}, MailCard);
			});
		}
		//#endregion
		exports.MAIL_SETTINGS_NAMESPACE = MAIL_NS;
		exports.MailCard = MailCard;
		exports.apply = apply;
		exports.createMailCardController = createMailCardController;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map

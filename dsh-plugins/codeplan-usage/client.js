/**
 * Browser half of `@local/codeplan-usage`.
 *
 * Registers one ambient entry below the composer card, beside the shipped
 * context meter, and reads the Host snapshot over the bundle's own loopback
 * route. Every request to the console API stays on the Host half; this file
 * never sees the token.
 */
window.__ModuleLoader__.load({
	id: '@local/codeplan-usage',
	factory(require) {
		'use strict';

		const React = require('react');
		const h = React.createElement;

		const SNAPSHOT_URL = '/plugins/codeplan-usage/snapshot';
		const TOKEN_URL = '/plugins/codeplan-usage/token';
		const SLOT = 'conversation.composer.dock';
		const SLOT_ID = 'codeplan-usage';
		const LOCALE_NS = 'codeplan-usage';
		const POLL_MS = 60_000;
		const TOKEN_PATTERN = /^[\w.-]{16,128}$/;

		/** `cp.` keeps every key clear of the shared common vocabulary. */
		const DICTS = {
			zh: {
				'cp.name': 'Coding Plan',
				'cp.loading': '加载中…',
				'cp.unconfigured': '未配置 · 点击粘贴 token',
				'cp.error': '取数失败',
				'cp.month': '本月',
				'cp.today': '今日',
				'cp.noLimit': '无上限',
				'cp.title': 'Coding Plan 额度',
				'cp.used': '本月已用',
				'cp.quota': '月度额度',
				'cp.remaining': '剩余',
				'cp.todaySpend': '今日消耗',
				'cp.updated': '更新时间',
				'cp.never': '尚未取数',
				'cp.refresh': '刷新',
				'cp.refreshing': '刷新中…',
				'cp.setupTitle': '粘贴 console token',
				'cp.setupHint':
					"在 https://ai-kas.kso.net/codeplan/ 的浏览器 console 里执行：copy(localStorage.getItem('wps_console_token'))",
				'cp.setupPlaceholder': '36 位 token',
				'cp.save': '保存',
				'cp.saving': '保存中…',
				'cp.saved': '已保存并刷新',
				'cp.badToken': '看起来不是 console token。',
				'cp.expired': '登录态失效，请重新粘贴 token',
			},
			en: {
				'cp.name': 'Coding Plan',
				'cp.loading': 'Loading…',
				'cp.unconfigured': 'Not configured · click to paste a token',
				'cp.error': 'Fetch failed',
				'cp.month': 'month',
				'cp.today': 'today',
				'cp.noLimit': 'no limit',
				'cp.title': 'Coding Plan usage',
				'cp.used': 'Used this month',
				'cp.quota': 'Monthly quota',
				'cp.remaining': 'Remaining',
				'cp.todaySpend': 'Today',
				'cp.updated': 'Updated',
				'cp.never': 'Never fetched',
				'cp.refresh': 'Refresh',
				'cp.refreshing': 'Refreshing…',
				'cp.setupTitle': 'Paste your console token',
				'cp.setupHint':
					"In the browser console at https://ai-kas.kso.net/codeplan/ run: copy(localStorage.getItem('wps_console_token'))",
				'cp.setupPlaceholder': '36-character token',
				'cp.save': 'Save',
				'cp.saving': 'Saving…',
				'cp.saved': 'Saved and refreshed',
				'cp.badToken': 'That does not look like a console token.',
				'cp.expired': 'Session expired — paste a new token',
			},
		};

		const CSS = `
.cplan-root{position:relative;display:inline-flex;align-items:center;vertical-align:middle;margin-right:12px;min-width:0;font-size:12px;line-height:18px}
.cplan-trigger{display:inline-flex;align-items:center;gap:8px;min-width:0;max-width:100%;padding:2px 8px;border:0;border-radius:9px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer}
.cplan-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-1))}
.cplan-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.cplan-dot{flex:none;width:6px;height:6px;border-radius:999px;background:var(--dsw-alias-state-idle-primary)}
.cplan-root[data-state=ok] .cplan-dot{background:var(--dsw-alias-state-success-primary)}
.cplan-root[data-state=warn] .cplan-dot{background:var(--dsw-alias-state-warn-primary)}
.cplan-root[data-state=error] .cplan-dot{background:var(--dsw-alias-state-error-primary)}
.cplan-name{flex:none;white-space:nowrap;color:var(--dsw-alias-label-secondary)}
.cplan-bar{flex:none;display:flex;width:56px;height:4px;border-radius:999px;overflow:hidden;background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.cplan-bar>i{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary)}
.cplan-root[data-state=warn] .cplan-bar>i{background:var(--dsw-alias-state-warn-primary)}
.cplan-root[data-state=error] .cplan-bar>i{background:var(--dsw-alias-state-error-primary)}
.cplan-fig{flex:none;white-space:nowrap;font-variant-numeric:tabular-nums;font-weight:500;color:var(--dsw-alias-label-primary)}
.cplan-muted{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.cplan-panel{position:absolute;bottom:calc(100% + 8px);left:0;z-index:40;box-sizing:border-box;width:min(330px,calc(100vw - 32px));padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 12px 32px rgba(0,0,0,.16);font-size:12px;line-height:20px}
.cplan-panelTitle{margin-bottom:8px;font-size:13px;font-weight:600}
.cplan-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.cplan-row+.cplan-row{margin-top:2px}
.cplan-rowLabel{color:var(--dsw-alias-label-secondary)}
.cplan-rowValue{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.cplan-sep{height:1px;margin:10px 0;background:var(--dsw-alias-border-l1)}
.cplan-error{margin-top:8px;color:var(--dsw-alias-state-error-primary);word-break:break-word}
.cplan-actions{display:flex;align-items:center;gap:8px;margin-top:10px}
.cplan-button{box-sizing:border-box;height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer}
.cplan-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-1))}
.cplan-button:disabled{cursor:default;opacity:.5}
.cplan-button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.cplan-form{margin-top:8px}
.cplan-formTitle{margin-bottom:6px;font-weight:600}
.cplan-hint{margin-bottom:8px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;word-break:break-all}
.cplan-inputRow{display:flex;gap:6px}
.cplan-input{box-sizing:border-box;flex:1;min-width:0;height:26px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit}
.cplan-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.cplan-note{margin-top:6px;color:var(--dsw-alias-state-success-primary)}
.cplan-note[data-error=true]{color:var(--dsw-alias-state-error-primary)}
`;

		const asRecord = (value) =>
			typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;

		const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

		/** Keep the strip short: ¥23.5 / ¥530 / ¥10.4 */
		function yuan(value) {
			const number = num(value);
			if (number === null) return '?';
			return number.toFixed(number < 100 ? 1 : 0);
		}

		function percentOf(value) {
			const number = num(value);
			if (number === null) return null;
			return `${(number * 100).toFixed(1)}%`;
		}

		function timeOf(epochMs) {
			const value = num(epochMs);
			if (value === null) return '—';
			return new Date(value).toLocaleTimeString();
		}

		return {
			inject: ['slots', 'locale'],
			apply(ctx) {
				for (const locale of ['zh', 'en']) {
					ctx.effect(() => {
						try {
							return ctx.locale.register(LOCALE_NS, locale, DICTS[locale]);
						} catch (error) {
							console.error(`[codeplan-usage] ${locale} dictionary rejected`, error);
							return () => {};
						}
					}, `codeplan-usage: ${locale} dictionary`);
				}

				const t = ctx.locale.bind(LOCALE_NS);

				function useUsage() {
					const [state, setState] = React.useState({ data: null, error: null, busy: false });
					const mounted = React.useRef(true);

					const load = React.useCallback(async (force) => {
						setState((prev) => ({ ...prev, busy: true }));
						try {
							const response = await fetch(force ? `${SNAPSHOT_URL}?fresh=1` : SNAPSHOT_URL, {
								headers: { accept: 'application/json' },
								cache: 'no-store',
							});
							if (!response.ok) throw new Error(`HTTP ${response.status}`);
							const data = asRecord(await response.json());
							if (!mounted.current) return;
							setState({ data, error: null, busy: false });
						} catch (error) {
							if (!mounted.current) return;
							const message = error instanceof Error ? error.message : String(error);
							setState((prev) => ({ data: prev.data, error: message, busy: false }));
						}
					}, []);

					React.useEffect(() => {
						mounted.current = true;
						void load(false);
						const timer = setInterval(() => {
							if (!document.hidden) void load(false);
						}, POLL_MS);
						const onVisible = () => {
							if (!document.hidden) void load(false);
						};
						document.addEventListener('visibilitychange', onVisible);
						return () => {
							mounted.current = false;
							clearInterval(timer);
							document.removeEventListener('visibilitychange', onVisible);
						};
					}, [load]);

					return {
						...state,
						refresh: () => void load(true),
					};
				}

				/** Locale switches re-render without re-registering the slot. */
				function useLocaleRevision() {
					const [, setRevision] = React.useState(0);
					React.useEffect(() => ctx.locale.subscribe(() => setRevision((value) => value + 1)), []);
				}

				function stateOf(data) {
					if (data === null) return 'idle';
					if (data.configured !== true || data.needsSetup === true) return 'idle';
					const utilization = num(data.utilization);
					if (utilization !== null && utilization >= 0.85) return 'warn';
					if (data.error !== null && data.error !== undefined && utilization === null) return 'error';
					return 'ok';
				}

				function Strip() {
					useLocaleRevision();
					const { data, error, busy, refresh } = useUsage();
					const [open, setOpen] = React.useState(false);
					const [draft, setDraft] = React.useState('');
					const [saving, setSaving] = React.useState(false);
					const [note, setNote] = React.useState(null);
					const rootRef = React.useRef(null);

					React.useEffect(() => {
						if (!open) return undefined;
						const onPointer = (event) => {
							const root = rootRef.current;
							if (root !== null && !root.contains(event.target)) setOpen(false);
						};
						const onKey = (event) => {
							if (event.key === 'Escape') setOpen(false);
						};
						document.addEventListener('pointerdown', onPointer);
						document.addEventListener('keydown', onKey);
						return () => {
							document.removeEventListener('pointerdown', onPointer);
							document.removeEventListener('keydown', onKey);
						};
					}, [open]);

					const state = stateOf(data);
					const configured = data !== null && data.configured === true && data.needsSetup !== true;
					const utilization = num(data?.utilization);
					const ratio = utilization === null ? 0 : Math.max(0, Math.min(1, utilization));
					const quota = data === null ? null : num(data.monthQuotaCny);
					const used = data === null ? null : num(data.monthUsedCny);

					const monthText =
						data === null
							? null
							: `${t('cp.month')} ¥${yuan(used)}/${quota === null ? t('cp.noLimit') : `¥${yuan(quota)}`}`;
					const todayText =
						data === null || data.todayCny === null ? null : `${t('cp.today')} ¥${yuan(data.todayCny)}`;

					let headline = null;
					if (data === null) headline = error === null ? t('cp.loading') : t('cp.error');
					else if (data.needsSetup === true) headline = t('cp.expired');
					else if (!configured) headline = t('cp.unconfigured');

					async function saveToken() {
						const value = draft.trim();
						if (!TOKEN_PATTERN.test(value)) {
							setNote({ error: true, text: t('cp.badToken') });
							return;
						}
						setSaving(true);
						setNote(null);
						try {
							const response = await fetch(TOKEN_URL, {
								method: 'POST',
								headers: { 'content-type': 'application/json' },
								body: JSON.stringify({ token: value }),
							});
							const body = asRecord(await response.json());
							if (!response.ok) {
								setNote({ error: true, text: String(body?.error ?? `HTTP ${response.status}`) });
								return;
							}
							setDraft('');
							setNote({ error: false, text: t('cp.saved') });
							refresh();
						} catch (failure) {
							setNote({
								error: true,
								text: failure instanceof Error ? failure.message : String(failure),
							});
						} finally {
							setSaving(false);
						}
					}

					const compact =
						headline === null
							? h('span', { className: 'cplan-muted' }, monthText ?? '')
							: h('span', { className: 'cplan-muted' }, headline);

					return h(
						React.Fragment,
						null,
						h('style', { key: 'style' }, CSS),
						h(
							'span',
							{ key: 'root', ref: rootRef, className: 'cplan-root', 'data-state': state },
							h(
								'button',
								{
									type: 'button',
									className: 'cplan-trigger',
									'aria-expanded': open,
									'aria-haspopup': 'dialog',
									title: t('cp.title'),
									onClick: () => setOpen((value) => !value),
								},
								h('span', { className: 'cplan-dot', 'aria-hidden': true }),
								h('span', { className: 'cplan-name' }, t('cp.name')),
								headline !== null
									? compact
									: [
											h(
												'span',
												{ className: 'cplan-bar', key: 'bar', 'aria-hidden': true },
												h('i', { style: { width: `${(ratio * 100).toFixed(1)}%` } }),
											),
											utilization === null
												? null
												: h('span', { className: 'cplan-fig', key: 'pct' }, percentOf(utilization)),
											monthText === null
												? null
												: h('span', { className: 'cplan-muted', key: 'month' }, monthText),
											todayText === null
												? null
												: h('span', { className: 'cplan-muted', key: 'today' }, todayText),
										],
							),
							open
								? h(
										'div',
										{ className: 'cplan-panel', role: 'dialog', 'aria-label': t('cp.title') },
										h('div', { className: 'cplan-panelTitle' }, t('cp.title')),
										h(
											'div',
											{ className: 'cplan-row' },
											h('span', { className: 'cplan-rowLabel' }, t('cp.used')),
											h('span', { className: 'cplan-rowValue' }, used === null ? '—' : `¥${yuan(used)}`),
										),
										h(
											'div',
											{ className: 'cplan-row' },
											h('span', { className: 'cplan-rowLabel' }, t('cp.quota')),
											h(
												'span',
												{ className: 'cplan-rowValue' },
												quota === null ? t('cp.noLimit') : `¥${yuan(quota)}`,
											),
										),
										quota !== null && used !== null
											? h(
													'div',
													{ className: 'cplan-row' },
													h('span', { className: 'cplan-rowLabel' }, t('cp.remaining')),
													h('span', { className: 'cplan-rowValue' }, `¥${yuan(quota - used)}`),
												)
											: null,
										h(
											'div',
											{ className: 'cplan-row' },
											h('span', { className: 'cplan-rowLabel' }, t('cp.todaySpend')),
											h(
												'span',
												{ className: 'cplan-rowValue' },
												data === null || data.todayCny === null ? '—' : `¥${yuan(data.todayCny)}`,
											),
										),
										h(
											'div',
											{ className: 'cplan-row' },
											h('span', { className: 'cplan-rowLabel' }, t('cp.updated')),
											h(
												'span',
												{ className: 'cplan-rowValue' },
												data === null || data.updatedAt === null ? t('cp.never') : timeOf(data.updatedAt),
											),
										),
										data !== null && data.error !== null && data.error !== undefined
											? h('div', { className: 'cplan-error' }, String(data.error))
											: null,
										busy ? null : h('div', { className: 'cplan-sep' }),
										!configured
											? h(
													'div',
													{ className: 'cplan-form' },
													h('div', { className: 'cplan-formTitle' }, t('cp.setupTitle')),
													h('div', { className: 'cplan-hint' }, t('cp.setupHint')),
													h(
														'div',
														{ className: 'cplan-inputRow' },
														h('input', {
															className: 'cplan-input',
															type: 'password',
															autoComplete: 'off',
															spellCheck: false,
															placeholder: t('cp.setupPlaceholder'),
															value: draft,
															onChange: (event) => setDraft(event.target.value),
															onKeyDown: (event) => {
																if (event.key === 'Enter') void saveToken();
															},
														}),
														h(
															'button',
															{
																type: 'button',
																className: 'cplan-button',
																disabled: saving,
																onClick: () => void saveToken(),
															},
															saving ? t('cp.saving') : t('cp.save'),
														),
													),
												)
											: null,
										note === null
											? null
											: h('div', { className: 'cplan-note', 'data-error': note.error }, note.text),
										configured
											? h(
													'div',
													{ className: 'cplan-actions' },
													h(
														'button',
														{ type: 'button', className: 'cplan-button', disabled: busy, onClick: refresh },
														busy ? t('cp.refreshing') : t('cp.refresh'),
													),
												)
											: null,
									)
								: null,
						),
					);
				}

				ctx.slots.inject(SLOT, () =>
					ctx.slots.register({ name: SLOT, id: SLOT_ID, order: 2 }, Strip),
				);
			},
		};
	},
});

/**
 * Host half of `@local/codeplan-usage`.
 *
 * The browser cannot hold the console token, so every request to the Coding Plan
 * console API happens here and the Client half only reads a small JSON snapshot.
 *
 * Auth (verified against the live service; see the note in codeplan-usage.pi.ts):
 * only the `x-console-token` header is needed — no cookie, no proxy. The service
 * echoes that header back, but it echoes whatever was sent, so it is not a
 * renewal channel; a 100401 simply means "paste a new token".
 *
 * Numbers are CNY. `console/overview/monthly-quota` is authoritative for the
 * quota and the month total; `console/overview/trend?metric=cost` supplies
 * per-day spend, and its `points` only contain days with usage — a missing
 * "today" point means zero, not a parse failure.
 *
 * Routes (loopback only; they never return the token itself):
 *   GET  /plugins/codeplan-usage/snapshot[?fresh=1]
 *   POST /plugins/codeplan-usage/token   {"token":"…"} | {"clear":true}
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_API_BASE = "https://ai-kas.kso.net/codeplan/api";
const TOKEN_HEADER = "x-console-token";

const SNAPSHOT_PATH = "/plugins/codeplan-usage/snapshot";
const TOKEN_PATH = "/plugins/codeplan-usage/token";

/**
 * Conservative throttle: probes showed the service tolerates far more.
 *
 * Must stay comfortably below the Client poll interval (60s). The timer fires every
 * 60s while `lastAttemptAt` is stamped a few ms *after* the client request arrives,
 * so an equal value loses the race and silently skips every other poll.
 */
const DEFAULT_THROTTLE_MS = 45_000;
const TIMEOUT_MS = 8_000;
/** Past this age the UI marks its reading as stale. */
const STALE_AFTER_MS = 3 * 60_000;
const MAX_BODY_BYTES = 8 * 1024;

const CODE_SESSION_EXPIRED = 100401;
const CODE_RATE_LIMITED = 100429;

/** Same shape the console issues; anything else is rejected before we write it. */
const TOKEN_PATTERN = /^[\w.-]{16,128}$/;

/** The route handlers need the browser carrier. */
export const inject = ["webServer"];

// ---------------------------------------------------------------- helpers

const asRecord = (value) =>
	typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;

const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const str = (value) =>
	typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

/** `YYYY-MM-DD` in local time — the endpoint groups by local date, not UTC. */
function localDate(epochMs) {
	const date = new Date(epochMs);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthStart(epochMs) {
	const date = new Date(epochMs);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

class ApiError extends Error {
	constructor(code, message) {
		super(message);
		this.name = "ApiError";
		this.code = code;
	}
}

function sendJson(res, status, body) {
	const text = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"content-length": Buffer.byteLength(text),
	});
	res.end(text);
}

async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > MAX_BODY_BYTES) throw new Error("request body too large");
		chunks.push(chunk);
	}
	const text = Buffer.concat(chunks).toString("utf8").trim();
	if (text === "") return {};
	const parsed = JSON.parse(text);
	return asRecord(parsed) ?? {};
}

// ---------------------------------------------------------------- plugin

/**
 * Mount the usage reader and its two loopback routes.
 * @param ctx - Host plugin context.
 * @param config - Row config from `cordis.patch.yml`; every field is optional.
 */
export function apply(ctx, config) {
	const apiBase = str(config?.apiBase) ?? DEFAULT_API_BASE;
	const throttleMs =
		num(config?.throttleMs) !== null && config.throttleMs >= 0
			? config.throttleMs
			: DEFAULT_THROTTLE_MS;
	const configuredTokenPath = str(config?.tokenPath);

	const dshHome = str(process.env.DSH_HOME) ?? join(homedir(), ".dsh");
	const writePath = configuredTokenPath ?? join(dshHome, "codeplan-token");
	/** Zero-setup fallback: reuse the token the pi extension already stored. */
	const piTokenPath = join(homedir(), ".pi", "agent", "codeplan-token");

	let token = null;
	let tokenSource = null;
	let needsSetup = false;
	let usage = null;
	let usageAt = 0;
	let lastError = null;
	let lastAttemptAt = 0;
	let inflight = null;

	function readTokenFile(path) {
		try {
			const value = str(readFileSync(path, "utf8"));
			return value !== null && TOKEN_PATTERN.test(value) ? value : null;
		} catch {
			return null;
		}
	}

	function resolveToken() {
		const fromEnv = str(process.env.CODEPLAN_CONSOLE_TOKEN);
		if (fromEnv !== null && TOKEN_PATTERN.test(fromEnv)) {
			token = fromEnv;
			tokenSource = "env";
			needsSetup = false;
			return;
		}
		const fromFile = readTokenFile(writePath) ?? (writePath === piTokenPath ? null : readTokenFile(piTokenPath));
		token = fromFile;
		tokenSource = fromFile === null ? null : "file";
		needsSetup = false;
	}

	function writeTokenFile(value) {
		mkdirSync(dirname(writePath), { recursive: true });
		writeFileSync(writePath, `${value}\n`, { encoding: "utf8", mode: 0o600 });
	}

	async function apiGet(path, params) {
		const url = new URL(path.replace(/^\/+/, ""), `${apiBase.replace(/\/+$/, "")}/`);
		for (const [key, value] of Object.entries(params)) {
			if (value === undefined || value === "") continue;
			url.searchParams.set(key, value);
		}

		const response = await fetch(url, {
			headers: { accept: "application/json", [TOKEN_HEADER]: token ?? "" },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});

		let body = null;
		try {
			body = await response.json();
		} catch {
			throw new ApiError(response.status, `response is not JSON (HTTP ${response.status})`);
		}

		const record = asRecord(body);
		const code = num(record?.code);
		if (code !== null && code !== 0) {
			throw new ApiError(code, str(record?.message) ?? str(record?.msg) ?? `business code ${code}`);
		}
		if (record === null) throw new ApiError(response.status, `unexpected response (HTTP ${response.status})`);
		return record;
	}

	async function fetchUsage(now) {
		const today = localDate(now);
		const [trend, quota] = await Promise.all([
			apiGet("console/overview/trend", {
				scope_type: "personal",
				metric: "cost",
				start_date: monthStart(now),
				end_date: today,
			}),
			apiGet("console/overview/monthly-quota", { scope_type: "personal" }),
		]);

		// trend: today's point plus the month running total
		const trendData = asRecord(trend.data);
		const rawPoints = trendData?.points;
		const points = Array.isArray(rawPoints) ? rawPoints : [];
		let todayCny = null;
		let monthSum = 0;
		let pointsWithValue = 0;
		for (const point of points) {
			const record = asRecord(point);
			if (record === null) continue;
			const value = num(record.value);
			if (value === null) continue;
			pointsWithValue += 1;
			monthSum += value;
			if (str(record.date) === today) todayCny = value;
		}
		// points only hold days with usage: zero today, not a parse failure
		if (todayCny === null && pointsWithValue > 0) todayCny = 0;

		// monthly-quota: authoritative quota and month total
		const quotaData = asRecord(quota.data);
		if (quotaData === null) throw new ApiError(-1, "monthly-quota is missing data");
		const monthQuotaCny = num(quotaData.monthly_quota_cny);
		const monthUsedCny = num(quotaData.monthly_cost_cny);
		const reported = num(quotaData.utilization_rate); // percentage
		const utilization =
			reported !== null
				? reported / 100
				: monthQuotaCny !== null && monthQuotaCny > 0 && monthUsedCny !== null
					? monthUsedCny / monthQuotaCny
					: null;

		usage = {
			month: str(quotaData.month),
			monthUsedCny: monthUsedCny ?? (pointsWithValue > 0 ? monthSum : null),
			monthQuotaCny,
			utilization,
			todayCny,
		};
		usageAt = now;
	}

	function handleFailure(error) {
		if (error instanceof ApiError && error.code === CODE_SESSION_EXPIRED) {
			needsSetup = true;
			token = null;
			tokenSource = null;
			lastError = "session expired (100401)";
			return;
		}
		if (error instanceof ApiError && error.code === CODE_RATE_LIMITED) {
			lastError = "rate limited (100429)";
			return;
		}
		if (error instanceof Error && error.name === "TimeoutError") {
			lastError = `timeout (>${TIMEOUT_MS / 1000}s)`;
			return;
		}
		lastError = error instanceof Error ? error.message : String(error);
	}

	/** Idempotent: concurrent callers share one request, and the throttle window wins. */
	function ensureRefresh(force) {
		if (inflight !== null) return inflight;
		if (needsSetup || token === null) return Promise.resolve();
		if (!force && Date.now() - lastAttemptAt < throttleMs) return Promise.resolve();

		const run = (async () => {
			lastAttemptAt = Date.now();
			try {
				await fetchUsage(Date.now());
				// keep the last good reading: a failed round must not wipe it
				lastError = null;
			} catch (error) {
				handleFailure(error);
			}
		})();
		inflight = run.finally(() => {
			inflight = null;
		});
		return inflight;
	}

	function snapshot() {
		const now = Date.now();
		const ageMs = usage === null ? null : now - usageAt;
		return {
			configured: token !== null,
			needsSetup,
			error: lastError,
			tokenSource,
			month: usage?.month ?? null,
			utilization: usage?.utilization ?? null,
			monthUsedCny: usage?.monthUsedCny ?? null,
			monthQuotaCny: usage?.monthQuotaCny ?? null,
			todayCny: usage?.todayCny ?? null,
			updatedAt: usage === null ? null : usageAt,
			ageMs,
			stale: ageMs !== null && ageMs > STALE_AFTER_MS,
		};
	}

	ctx.effect(
		() =>
			ctx.webServer.register({
				kind: "exact",
				path: SNAPSHOT_PATH,
				handler: async (req, res) => {
					try {
						if (req.method !== "GET" && req.method !== "HEAD") {
							sendJson(res, 405, { error: "method not allowed" });
							return;
						}
						const fresh = (req.url ?? "").includes("fresh=1");
						// Always hand control to ensureRefresh: it already no-ops without a token, merges
						// concurrent callers, and enforces the throttle unless fresh forces a fetch.
						// Gating on "usage === null" here froze every later poll on the first cache.
						await ensureRefresh(fresh);
						sendJson(res, 200, snapshot());
					} catch (error) {
						sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
					}
				},
			}),
		"codeplan-usage: snapshot route",
	);

	ctx.effect(
		() =>
			ctx.webServer.register({
				kind: "exact",
				path: TOKEN_PATH,
				handler: async (req, res) => {
					try {
						if (req.method !== "POST") {
							sendJson(res, 405, { error: "method not allowed" });
							return;
						}
						const body = await readJsonBody(req);
						if (body.clear === true) {
							try {
								rmSync(writePath, { force: true });
							} catch {
								// keep going: the in-memory token is what matters here
							}
							token = null;
							tokenSource = null;
							needsSetup = false;
							usage = null;
							usageAt = 0;
							lastError = null;
							lastAttemptAt = 0;
							sendJson(res, 200, snapshot());
							return;
						}

						const value = str(body.token);
						if (value === null || !TOKEN_PATTERN.test(value)) {
							// Keep `error` the only top-level field so the Client shows this message:
							// a spread snapshot would shadow it with the last fetch error.
							sendJson(res, 400, { error: "invalid token" });
							return;
						}
						writeTokenFile(value);
						token = value;
						tokenSource = "file";
						needsSetup = false;
						usage = null;
						usageAt = 0;
						lastError = null;
						lastAttemptAt = 0;
						await ensureRefresh(true);
						sendJson(res, 200, snapshot());
					} catch (error) {
						sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
					}
				},
			}),
		"codeplan-usage: token route",
	);

	resolveToken();
}

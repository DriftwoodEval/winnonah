/**
 * Screenshots a page of the running UI preview server with a fake signed-in user and canned tRPC
 * data, so no database, Google login, or `.env` is needed.
 *
 * Start the server first: `mise run ui-preview`. Then:
 *   pnpm exec tsx scripts/ui-preview/shot.ts /settings --phone --out /tmp/settings.png
 *
 * Options: --phone | --desktop (default desktop), --dark, --click "text" and --click-selector "css" (both
 * repeatable, run in order), --wait <ms> (extra settle time), --full (full-page capture), --out <file>,
 * --port <n> (default 3100).
 */
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Route } from "playwright-core";
import superjson from "superjson";
import { FAKE_SESSION, FIXTURES, type ProcedurePath } from "./fixtures";

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		phone: { type: "boolean" },
		desktop: { type: "boolean" },
		dark: { type: "boolean" },
		full: { type: "boolean" },
		click: { type: "string", multiple: true },
		"click-selector": { type: "string", multiple: true },
		wait: { type: "string", default: "800" },
		out: { type: "string" },
		port: { type: "string", default: "3100" },
	},
});

const pagePath = positionals[0] ?? "/";
const viewport = values.phone
	? { width: 390, height: 844 }
	: { width: 1440, height: 900 };
const slug = pagePath.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home";
const out =
	values.out ??
	path.join(
		tmpdir(),
		"ui-preview",
		`${slug}-${values.phone ? "phone" : "desktop"}.png`,
	);
mkdirSync(path.dirname(out), { recursive: true });

const missing = new Set<string>();

function trpcResult(procedure: string, input: unknown) {
	if (!(procedure in FIXTURES)) {
		missing.add(procedure);
		return {
			error: {
				message: `ui-preview: no fixture for ${procedure}`,
				code: -32004,
				data: { code: "NOT_FOUND", httpStatus: 404, path: procedure },
			},
		};
	}
	const fixture = FIXTURES[procedure as ProcedurePath];
	const value = typeof fixture === "function" ? fixture(input) : fixture;
	return { result: { data: value } };
}

function batchInputs(
	url: URL,
	postBody: string | null,
): Record<string, unknown> {
	const raw = postBody ?? url.searchParams.get("input");
	if (!raw) return {};
	const parsed = JSON.parse(raw) as Record<string, { json?: unknown }>;
	return Object.fromEntries(
		Object.entries(parsed).map(([i, v]) => [i, v?.json]),
	);
}

async function handleTrpc(route: Route) {
	const request = route.request();
	const url = new URL(request.url());
	const procedures = decodeURIComponent(
		url.pathname.replace(/^\/api\/trpc\//, ""),
	).split(",");
	const inputs = batchInputs(url, request.postData());
	// Subscriptions use server-sent events: send an empty, open-ended stream.
	if (request.headers().accept?.includes("text/event-stream")) {
		await route.fulfill({ contentType: "text/event-stream", body: "" });
		return;
	}
	// The client uses httpBatchStreamLink, which reads one jsonl head line mapping each batch index
	// to `[[value]]` (no deferred chunks). The transformer is applied to the whole line, not to
	// each result.
	const head = Object.fromEntries(
		procedures.map((p, i) => [i, [[trpcResult(p, inputs[String(i)])]]]),
	);
	await route.fulfill({
		contentType: "application/jsonl",
		body: `${JSON.stringify(superjson.serialize(head))}\n`,
	});
}

const executablePath =
	process.env.CHROMIUM_PATH ?? execSync("which chromium").toString().trim();
const browser = await chromium.launch({ executablePath });
const context = await browser.newContext({
	viewport,
	deviceScaleFactor: 2,
	isMobile: !!values.phone,
	hasTouch: !!values.phone,
	colorScheme: values.dark ? "dark" : "light",
});
const page = await context.newPage();

// Playwright tries the most recently registered route first, so register the catch-all first.
await page.route("**/api/auth/**", (route) => route.fulfill({ json: {} }));
await page.route("**/api/auth/session", (route) =>
	route.fulfill({ json: FAKE_SESSION }),
);
await page.route("**/api/trpc/**", handleTrpc);

page.on("pageerror", (error) => console.log(`[page error] ${error.message}`));
page.on("console", (message) => {
	if (message.type() === "error") console.log(`[console] ${message.text()}`);
});

await page.goto(`http://localhost:${values.port}${pagePath}`, {
	waitUntil: "networkidle",
	timeout: 120_000,
});
// Hide the Next.js dev badge and error overlay so they do not cover the page.
await page.addStyleTag({
	content: "nextjs-portal { display: none !important; }",
});
for (const text of values.click ?? []) {
	await page.getByText(text, { exact: false }).first().click();
	await page.waitForTimeout(300);
}
for (const selector of values["click-selector"] ?? []) {
	await page.locator(selector).first().click();
	await page.waitForTimeout(300);
}
await page.waitForTimeout(Number(values.wait));
await page.screenshot({ path: out, fullPage: !!values.full });
await browser.close();

console.log(`screenshot: ${out}`);
if (missing.size > 0) {
	console.log(
		`missing fixtures (add to fixtures.ts):\n  ${[...missing].join("\n  ")}`,
	);
}

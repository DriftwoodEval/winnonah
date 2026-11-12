import { MAX_RECENT_ERRORS_LENGTH } from "~/lib/validations/config";

const MAX_ENTRIES = 20;
const MAX_ENTRY_LENGTH = 800;
const MAX_STACK_FRAMES = 4;

const entries: string[] = [];
let installed = false;

/** Tag name plus the image/link URL, without inlined data: payloads. */
function describeElement(element: Element) {
	const url = element.getAttribute("src") ?? element.getAttribute("href") ?? "";
	const shortUrl = url.startsWith("data:") ? "data:..." : url.slice(0, 120);
	return `<${element.tagName.toLowerCase()}${shortUrl ? ` ${shortUrl}` : ""}>`;
}

/** Error name and message, tRPC code/path when present, and the top stack frames. */
function describeError(error: Error) {
	const { data } = error as { data?: { code?: string; path?: string } };
	const trpc = data?.code ? ` [${data.code} ${data.path ?? ""}]`.trimEnd() : "";
	const frames = (error.stack ?? "")
		.split("\n")
		.filter((line) => line.trimStart().startsWith("at "))
		.slice(0, MAX_STACK_FRAMES)
		.map((line) => line.trim());
	return [`${error.name}: ${error.message}${trpc}`, ...frames].join("\n  ");
}

function describe(value: unknown) {
	if (value instanceof Error) return describeError(value);
	if (value instanceof Element) return describeElement(value);
	if (value instanceof Event) {
		const target =
			value.target instanceof Element ? describeElement(value.target) : "";
		return `${value.type} event ${target}`.trim();
	}
	return String(value);
}

function record(message: string) {
	entries.push(
		`${new Date().toLocaleTimeString()} ${message}`.slice(0, MAX_ENTRY_LENGTH),
	);
	if (entries.length > MAX_ENTRIES) entries.shift();
}

/**
 * Starts keeping the most recent browser errors (uncaught errors, unhandled
 * promise rejections, and anything passed to console.error, which includes
 * failed tRPC calls) so an issue report can include them. Safe to call twice.
 */
export function installClientErrorLog() {
	if (installed) return;
	installed = true;

	window.addEventListener("error", (event) => {
		// Browsers fire this harmless warning when a resize callback changes
		// layout again in the same frame (e.g. an animating row in a virtualized
		// list). It isn't a real failure, so keep it out of issue reports.
		if (event.message.startsWith("ResizeObserver loop")) return;
		const location = `(${event.filename}:${event.lineno}:${event.colno})`;
		record(
			event.error instanceof Error
				? `${describeError(event.error)}\n  ${location}`
				: `${event.message} ${location}`,
		);
	});
	window.addEventListener("unhandledrejection", (event) => {
		record(`Unhandled rejection: ${describe(event.reason)}`);
	});

	const originalError = console.error;
	console.error = (...args: unknown[]) => {
		record(args.map(describe).join(" "));
		originalError.apply(console, args);
	};
}

/** The recorded errors, oldest first, or undefined if there were none. */
export function getRecentErrors() {
	// Drop the oldest entries until the log fits what the server accepts.
	const kept = [...entries];
	while (kept.join("\n").length > MAX_RECENT_ERRORS_LENGTH) kept.shift();
	return kept.length > 0 ? kept.join("\n") : undefined;
}

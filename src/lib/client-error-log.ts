const MAX_ENTRIES = 15;
const MAX_ENTRY_LENGTH = 300;

const entries: string[] = [];
let installed = false;

function describe(value: unknown) {
	return value instanceof Error ? value.message : String(value);
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
		record(`${event.message} (${event.filename}:${event.lineno})`);
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
	return entries.length > 0 ? entries.join("\n") : undefined;
}

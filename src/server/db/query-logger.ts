import type { Logger } from "drizzle-orm/logger";

const FLUSH_AFTER_IDLE_MS = 500;
const MAX_LINE_LENGTH = 160;

/** Shortens a statement to its verb, table and filters, e.g. `select ... from clients where id = ?`. */
function summarize(sql: string) {
	const oneLine = sql
		.replace(/`emr_(\w+)`/g, "$1")
		.replace(/`/g, "")
		.replace(/^select .*? from /, "select ... from ")
		.replace(/\s+/g, " ");
	return oneLine.length > MAX_LINE_LENGTH
		? `${oneLine.slice(0, MAX_LINE_LENGTH)}...`
		: oneLine;
}

/**
 * Drizzle logger that groups identical statements and prints one line per
 * distinct statement, with a repeat count, once queries go quiet. A loop that
 * runs the same query per row shows up as a single line with a large count.
 */
export class GroupedQueryLogger implements Logger {
	private counts = new Map<string, number>();
	private timer: ReturnType<typeof setTimeout> | undefined;

	logQuery(query: string) {
		const key = summarize(query);
		this.counts.set(key, (this.counts.get(key) ?? 0) + 1);

		clearTimeout(this.timer);
		this.timer = setTimeout(() => this.flush(), FLUSH_AFTER_IDLE_MS);
		this.timer.unref();
	}

	private flush() {
		const entries = [...this.counts].sort((a, b) => b[1] - a[1]);
		this.counts.clear();

		const total = entries.reduce((sum, [, count]) => sum + count, 0);
		const lines = entries.map(
			([key, count]) => `${String(count).padStart(5)}x ${key}`,
		);
		console.log(`[db] ${total} queries\n${lines.join("\n")}`);
	}
}

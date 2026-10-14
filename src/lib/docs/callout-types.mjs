/**
 * Callout type vocabulary shared by the `remark-docs-callouts` plugin (which
 * decides which `> [!x]` blockquotes to transform) and the `<Callout>`
 * component (which styles them). The type list and aliases follow Obsidian /
 * `remark-callouts`, with two changes: `important` and `caution` are their own
 * types here (matching GitHub's alert set) rather than aliases.
 */

/** Canonical callout types, each with a distinct icon and color in `<Callout>`. */
export const CALLOUT_TYPES = [
	"note",
	"abstract",
	"info",
	"todo",
	"tip",
	"success",
	"question",
	"warning",
	"important",
	"caution",
	"failure",
	"danger",
	"bug",
	"example",
	"quote",
];

/**
 * Alternate spellings that resolve to a canonical type.
 * @type {Record<string, string>}
 */
export const CALLOUT_ALIASES = {
	summary: "abstract",
	tldr: "abstract",
	hint: "tip",
	check: "success",
	done: "success",
	help: "question",
	faq: "question",
	attention: "warning",
	fail: "failure",
	missing: "failure",
	error: "danger",
	cite: "quote",
};

const CANONICAL = new Set(CALLOUT_TYPES);

/**
 * Resolve a raw marker keyword (case-insensitive) to a canonical type, or
 * `null` if it isn't a known callout type or alias.
 * @param {string} raw
 * @returns {string | null}
 */
export function resolveCalloutType(raw) {
	const key = raw.trim().toLowerCase();
	if (CANONICAL.has(key)) return key;
	return CALLOUT_ALIASES[key] ?? null;
}

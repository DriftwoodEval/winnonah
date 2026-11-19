import { Redact } from "@components/redaction/Redact";
import { Badge } from "@ui/badge";
import { formatInBusinessTime } from "~/lib/utils";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ACRONYMS = new Set([
	"id",
	"url",
	"json",
	"dds",
	"sms",
	"dob",
	"asd",
	"adhd",
	"ld",
	"csv",
	"pdf",
	"scm",
	"npi",
]);

/** Words that always display with fixed casing, e.g. product and proper names. */
const FIXED_WORDS: Record<string, string> = {
	py: "Python",
	gcal: "GCal",
	pearson: "Pearson",
	medicaid: "Medicaid",
	quo: "Quo",
};

/** Plain-language casing for one word: acronyms (and their plurals) upper, fixed names as written, the rest lower. */
function wordFor(word: string) {
	const lower = word.toLowerCase();
	const fixed = FIXED_WORDS[lower];
	if (fixed) return fixed;
	if (ACRONYMS.has(lower)) return lower.toUpperCase();
	if (lower.endsWith("s") && ACRONYMS.has(lower.slice(0, -1))) {
		return `${lower.slice(0, -1).toUpperCase()}s`;
	}
	return lower;
}

/** "oldEventId" -> "old event ID" (no leading capital, so it can follow a ": "). */
function wordsFor(key: string) {
	return key
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.split(" ")
		.map(wordFor)
		.join(" ")
		.replace(/\bbaby net\b/, "BabyNet");
}

const capitalize = (text: string) =>
	text.charAt(0).toUpperCase() + text.slice(1);

/** "oldEventId" -> "Old event ID" */
function labelFor(key: string) {
	return capitalize(wordsFor(key));
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const REASON_CODE = /^[a-z]+(_[a-z]+)+$/;

/** Namespaces that only say where an action came from, so the label drops them. */
const SOURCE_NAMESPACES = new Set(["internal", "python"]);

/**
 * "python.gcal.event_deleted" -> "GCal: event deleted" (drops the source namespace).
 * Any other namespace stays so generic names are not ambiguous:
 * "clients.update" -> "Clients: update".
 */
export function actionLabel(action: string) {
	const [first = action, ...rest] = action.split(".");
	const parts =
		SOURCE_NAMESPACES.has(first) && rest.length > 0 ? rest : [first, ...rest];
	return capitalize(
		parts.map((part) => wordsFor(part.replace(/_/g, " "))).join(": "),
	);
}

/** Plain-language form of a stored string: timestamps in business time, snake_case codes as words. */
function readableString(value: string) {
	if (ISO_TIMESTAMP.test(value)) {
		const date = new Date(value);
		if (!Number.isNaN(date.getTime())) {
			return formatInBusinessTime(date, "M/d/yy h:mm a");
		}
	}
	if (REASON_CODE.test(value)) {
		return labelFor(value.replace(/_/g, " "));
	}
	return value;
}

/** A diff leaf written by `diffValues`: exactly `{ from, to }`. */
function isChange(value: unknown): value is { from: unknown; to: unknown } {
	return (
		isObject(value) &&
		Object.keys(value).length === 2 &&
		"from" in value &&
		"to" in value
	);
}

/** An array diff written by `diffValues`: exactly `{ added, removed }`. */
function isArrayChange(
	value: unknown,
): value is { added: unknown[]; removed: unknown[] } {
	return (
		isObject(value) &&
		Object.keys(value).length === 2 &&
		Array.isArray(value.added) &&
		Array.isArray(value.removed)
	);
}

function Scalar({ value, field }: { value: unknown; field?: string }) {
	if (value === null || value === undefined || value === "") {
		return <span className="text-muted-foreground">None</span>;
	}
	if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
	if (typeof value === "string") {
		return (
			<span className="break-words whitespace-pre-wrap">
				<Redact>{readableString(value)}</Redact>
			</span>
		);
	}
	if (typeof value === "number") return <>{value}</>;
	return <ValueView field={field} value={value} />;
}

/** Pairs each item with a React key that stays unique when the same value repeats. */
function withKeys(items: unknown[], prefix = "") {
	const seen = new Map<string, number>();
	return items.map((item) => {
		const base = `${prefix}${JSON.stringify(item)}`;
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		return { item, key: `${base}#${count}` };
	});
}

function ValueView({ value, field }: { value: unknown; field?: string }) {
	if (isChange(value)) {
		return (
			<div className="flex flex-wrap items-baseline gap-x-2">
				<span className="text-muted-foreground line-through">
					<Scalar field={field} value={value.from} />
				</span>
				<span aria-hidden className="text-muted-foreground">
					→
				</span>
				<Scalar field={field} value={value.to} />
			</div>
		);
	}
	if (isArrayChange(value)) {
		return (
			<span className="flex flex-wrap gap-1">
				{withKeys(value.added, "+").map(({ item, key }) => (
					<Badge key={key} variant="success">
						+ <Scalar field={field} value={item} />
					</Badge>
				))}
				{withKeys(value.removed, "-").map(({ item, key }) => (
					<Badge key={key} variant="destructive">
						− <Scalar field={field} value={item} />
					</Badge>
				))}
			</span>
		);
	}
	if (Array.isArray(value)) {
		if (value.length === 0) return <Scalar value={null} />;
		return (
			<span className="flex flex-wrap gap-1">
				{withKeys(value).map(({ item, key }) =>
					isObject(item) ? (
						<span className="block w-full rounded border p-2" key={key}>
							<FieldGrid fields={item} />
						</span>
					) : (
						<Badge key={key} variant="outline">
							<Scalar field={field} value={item} />
						</Badge>
					),
				)}
			</span>
		);
	}
	if (isObject(value)) return <FieldGrid fields={value} />;
	return <Scalar field={field} value={value} />;
}

function FieldGrid({ fields }: { fields: JsonObject }) {
	const entries = Object.entries(fields);
	if (entries.length === 0) return <Scalar value={null} />;
	return (
		<dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5">
			{entries.map(([key, value]) => (
				<div className="contents" key={key}>
					<dt className="text-muted-foreground">{labelFor(key)}</dt>
					<dd className="min-w-0">
						<ValueView value={value} />
					</dd>
				</div>
			))}
		</dl>
	);
}

/** Some details store a nested value as a JSON string; parse those (at any depth) so they render as fields. */
function unpackJson(value: unknown): unknown {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!/^[{[]/.test(trimmed)) return value;
		try {
			const parsed: unknown = JSON.parse(trimmed);
			return typeof parsed === "object" && parsed !== null
				? unpackJson(parsed)
				: value;
		} catch {
			return value;
		}
	}
	if (Array.isArray(value)) return value.map(unpackJson);
	if (isObject(value)) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, unpackJson(item)]),
		);
	}
	return value;
}

/** One-line preview of a detail payload, shown while its row is collapsed. */
export function summarizeDetail(rawDetail: unknown): string | null {
	if (rawDetail === null || rawDetail === undefined) return null;
	const detail = unpackJson(rawDetail);
	if (!isObject(detail)) return String(detail);
	return Object.entries(detail)
		.map(([key, value]) => `${labelFor(key)}: ${previewValue(value, key)}`)
		.join(" · ");
}

function previewValue(value: unknown, field?: string): string {
	if (isChange(value)) {
		return `${previewValue(value.from, field)} → ${previewValue(value.to, field)}`;
	}
	if (value === null || value === undefined || value === "") return "none";
	if (Array.isArray(value)) {
		return value.length === 0
			? "none"
			: `${value.length} item${value.length === 1 ? "" : "s"}`;
	}
	if (typeof value === "object") return "details";
	if (typeof value === "string") return readableString(value);
	return String(value);
}

/** The full detail payload as labelled fields instead of raw JSON. */
export function AuditDetail({ detail }: { detail: unknown }) {
	if (detail === null || detail === undefined) {
		return <p className="text-muted-foreground">No extra detail recorded.</p>;
	}
	return (
		<div className="text-sm">
			<ValueView value={unpackJson(detail)} />
		</div>
	);
}

import { Redact } from "@components/redaction/Redact";
import { Badge } from "@ui/badge";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** "oldEventId" -> "Old event id" */
function labelFor(key: string) {
	const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
	return words.charAt(0).toUpperCase() + words.slice(1);
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

function Scalar({ value }: { value: unknown }) {
	if (value === null || value === undefined || value === "") {
		return <span className="text-muted-foreground">None</span>;
	}
	if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
	if (typeof value === "string") {
		return (
			<span className="break-words whitespace-pre-wrap">
				<Redact>{value}</Redact>
			</span>
		);
	}
	if (typeof value === "number") return <>{value}</>;
	return (
		<span className="font-mono text-xs break-all">{JSON.stringify(value)}</span>
	);
}

function ValueView({ value }: { value: unknown }) {
	if (isChange(value)) {
		return (
			<span className="flex flex-wrap items-baseline gap-x-2">
				<span className="text-muted-foreground line-through">
					<Scalar value={value.from} />
				</span>
				<span aria-hidden className="text-muted-foreground">
					→
				</span>
				<Scalar value={value.to} />
			</span>
		);
	}
	if (isArrayChange(value)) {
		return (
			<span className="flex flex-wrap gap-1">
				{value.added.map((item) => (
					<Badge key={`+${JSON.stringify(item)}`} variant="success">
						+ <Scalar value={item} />
					</Badge>
				))}
				{value.removed.map((item) => (
					<Badge key={`-${JSON.stringify(item)}`} variant="destructive">
						− <Scalar value={item} />
					</Badge>
				))}
			</span>
		);
	}
	if (Array.isArray(value)) {
		if (value.length === 0) return <Scalar value={null} />;
		return (
			<span className="flex flex-wrap gap-1">
				{value.map((item) => (
					<Badge key={JSON.stringify(item)} variant="outline">
						{isObject(item) ? JSON.stringify(item) : <Scalar value={item} />}
					</Badge>
				))}
			</span>
		);
	}
	if (isObject(value)) return <FieldGrid fields={value} />;
	return <Scalar value={value} />;
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

/** One-line preview of a detail payload, shown while its row is collapsed. */
export function summarizeDetail(detail: unknown): string | null {
	if (detail === null || detail === undefined) return null;
	if (!isObject(detail)) return String(detail);
	return Object.entries(detail)
		.map(([key, value]) => `${labelFor(key)}: ${previewValue(value)}`)
		.join(" · ");
}

function previewValue(value: unknown): string {
	if (isChange(value)) {
		return `${previewValue(value.from)} → ${previewValue(value.to)}`;
	}
	if (value === null || value === undefined || value === "") return "none";
	if (typeof value === "object") return "…";
	return String(value);
}

/** The full detail payload as labelled fields instead of raw JSON. */
export function AuditDetail({ detail }: { detail: unknown }) {
	if (detail === null || detail === undefined) {
		return <p className="text-muted-foreground">No extra detail recorded.</p>;
	}
	return (
		<div className="text-sm">
			<ValueView value={detail} />
		</div>
	);
}

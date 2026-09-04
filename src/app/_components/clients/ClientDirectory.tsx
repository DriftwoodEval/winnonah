"use client";

import {
	ColumnFilter,
	type FilterOption,
	toFilterOptions,
} from "@components/shared/ColumnFilter";
import type { inferRouterOutputs } from "@trpc/server";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Skeleton } from "@ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
	memo,
	useEffect,
	useMemo,
	useRef,
	useState,
	useTransition,
} from "react";
import { useMediaQuery } from "~/hooks/use-media-query";
import {
	CLIENT_COLOR_KEYS,
	type ClientColor,
	formatColorName,
	getHexFromColor,
} from "~/lib/colors";
import { ALLOWED_ASD_ADHD_VALUES, type PUNCH_SCHEMA } from "~/lib/constants";
import {
	cn,
	compareDateOnly,
	formatClientAge,
	formatShortDate,
	formatShortInstantDate,
} from "~/lib/utils";
import type { AppRouter } from "~/server/api/root";
import { api } from "~/trpc/react";
import { Redact } from "../redaction/Redact";
import { NameSearchInput } from "./NameSearchInput";

const FILTER_TIMEOUT_MS = 24 * 60 * 60 * 1000;

// Sentinel meaning "the underlying field is null/unset" - mirrors NONE_FILTER_VALUE
// exported from the client router so filter values line up on both ends.
const NONE_FILTER_VALUE = "__none__";

const PRIORITY_REASONS = new Set([
	"High Priority",
	"BabyNet above 2:6",
	"BabyNet and High Priority",
]);

function formatPriorityReason(sortReason: string, dob: string) {
	if (sortReason === "BabyNet above 2:6") {
		return `BabyNet: ${formatClientAge(dob, "short")}`;
	}
	if (sortReason === "BabyNet and High Priority") {
		return `High Priority, BabyNet: ${formatClientAge(dob, "short")}`;
	}
	return sortReason;
}

type ColumnKey =
	| "priority"
	| "for"
	| "language"
	| "daQs"
	| "evalQs"
	| "insurance"
	| "secondaryInsurance"
	| "priorAuthDate"
	| "daScheduled"
	| "evalScheduled"
	| "location"
	| "evaluator"
	| "paAssignedTo";

const COLUMN_LABELS: Record<ColumnKey, string> = {
	priority: "Priority",
	for: "For",
	language: "Language",
	daQs: "DA Qs",
	evalQs: "EVAL Qs",
	insurance: "Primary Insurance",
	secondaryInsurance: "Secondary Insurance",
	priorAuthDate: "Prior Auth Date",
	daScheduled: "DA Scheduled",
	evalScheduled: "EVAL Scheduled",
	location: "Location",
	evaluator: "Evaluator",
	paAssignedTo: "PA Assigned To",
};

const TOGGLEABLE_COLUMNS: ColumnKey[] = [
	"priority",
	"for",
	"language",
	"daQs",
	"evalQs",
	"insurance",
	"secondaryInsurance",
	"priorAuthDate",
	"daScheduled",
	"evalScheduled",
	"location",
	"evaluator",
	"paAssignedTo",
];

// Not a real table column, just a badge next to the name, but its visibility
// is controlled the same way through the Columns menu.
const FAILURES_TOGGLE_KEY = "failures";
type ExtraToggleKey = typeof FAILURES_TOGGLE_KEY;
type ToggleKey = ColumnKey | ExtraToggleKey;

const ALL_TOGGLE_LABELS: Record<ToggleKey, string> = {
	[FAILURES_TOGGLE_KEY]: "Blockers",
	...COLUMN_LABELS,
};

const DEFAULT_VISIBLE_COLUMNS: Record<ToggleKey, boolean> = {
	priority: true,
	for: true,
	language: true,
	daQs: true,
	evalQs: true,
	insurance: true,
	secondaryInsurance: true,
	priorAuthDate: true,
	daScheduled: true,
	evalScheduled: true,
	location: true,
	evaluator: true,
	paAssignedTo: true,
	[FAILURES_TOGGLE_KEY]: true,
};

// "daQs"/"evalQs"/"paAssignedTo" are sorted client-side (see the `clients`
// useMemo below) since their data comes from the Google Sheets punchlist,
// not the DB.
const SORT_KEYS = [
	"name",
	"priority",
	"status",
	"for",
	"language",
	"daQs",
	"evalQs",
	"insurance",
	"secondaryInsurance",
	"priorAuthDate",
	"daScheduled",
	"evalScheduled",
	"location",
	"evaluator",
	"paAssignedTo",
] as const;
type SortKey = (typeof SORT_KEYS)[number];

function isSortKey(value: string | null): value is SortKey {
	return !!value && (SORT_KEYS as readonly string[]).includes(value);
}

const QS_STAGE_ORDER: Record<string, number> = {
	Needed: 0,
	Sent: 1,
	Done: 2,
};

const PRIORITY_FILTER_OPTIONS: FilterOption[] = [
	{ value: "highPriority", label: "High Priority" },
	{ value: "babyNet", label: "BabyNet" },
	{ value: "both", label: "High Priority + BabyNet" },
];

const QS_FILTER_OPTIONS: FilterOption[] = [
	{ value: "Needed", label: "Needed" },
	{ value: "Sent", label: "Sent" },
	{ value: "Done", label: "Done" },
	{ value: NONE_FILTER_VALUE, label: "None" },
];

const YES_NO_FILTER_OPTIONS: FilterOption[] = [
	{ value: "yes", label: "Yes" },
	{ value: "no", label: "No" },
];

// Every URL param that represents a filter (as opposed to name search, sort,
// or column layout), cleared together by the "Clear filters" button.
const FILTER_PARAM_KEYS = [
	"for",
	"insurance",
	"secondaryInsurance",
	"language",
	"status",
	"color",
	"priority",
	"daQs",
	"evalQs",
	"priorAuthDate",
	"daScheduled",
	"evalScheduled",
	"location",
	"evaluator",
	"paAssignedTo",
	"hasFailures",
] as const;

type QsPrefix = "DA" | "EVAL";
type QsPunchRow = Pick<
	PUNCH_SCHEMA,
	| "DA Qs Done"
	| "DA Qs Sent"
	| "DA Qs Needed"
	| "EVAL Qs Done"
	| "EVAL Qs Sent"
	| "EVAL Qs Needed"
>;

// The furthest-along truthy stage wins: Done beats Sent beats Needed
function getQsStage(prefix: QsPrefix, punchRow: QsPunchRow | undefined) {
	if (!punchRow) return null;
	if (punchRow[`${prefix} Qs Done`] === "TRUE") return "Done";
	if (punchRow[`${prefix} Qs Sent`] === "TRUE") return "Sent";
	if (punchRow[`${prefix} Qs Needed`] === "TRUE") return "Needed";
	return null;
}

type DirectoryClient =
	inferRouterOutputs<AppRouter>["clients"]["directory"][number];

interface SortableClient {
	id: number;
	fullName: string;
	status: boolean;
	asdAdhd: string | null;
	language: string | null;
	primaryInsurance: string | null;
	secondaryInsurance: string[];
	sortReason: string;
	dob: string | Date;
	addedDate: string | Date | null;
	priorAuthDate: string | null;
	daScheduled: boolean;
	daScheduledDate: string | Date | null;
	evalScheduled: boolean;
	evalScheduledDate: string | Date | null;
	location: string | null;
	evaluator: string | null;
	paAssignedTo: string | null;
}

// Mirrors getPriorityInfo()'s SQL buckets/tie-break (server/api/routers/client.ts)
// so the default "priority" sort matches the homepage client search exactly.
const PRIORITY_REASON_BUCKET: Record<string, number> = {
	"BabyNet and High Priority": 0,
	"BabyNet above 2:6": 1,
	"High Priority": 2,
};

function comparePriority(a: SortableClient, b: SortableClient) {
	const bucketA = PRIORITY_REASON_BUCKET[a.sortReason] ?? 3;
	const bucketB = PRIORITY_REASON_BUCKET[b.sortReason] ?? 3;
	if (bucketA !== bucketB) return bucketA - bucketB;

	const useDob = bucketA <= 1;
	const tieA = (useDob ? a.dob : a.addedDate) ?? 0;
	const tieB = (useDob ? b.dob : b.addedDate) ?? 0;
	return new Date(tieA).getTime() - new Date(tieB).getTime();
}

function compareStrings(
	a: string | null | undefined,
	b: string | null | undefined,
) {
	return (a ?? "").localeCompare(b ?? "");
}

// Sorts the already-fetched, already-filtered client list in the browser.
// The full result set lives on the client with no pagination, so every
// column sorts instantly instead of round-tripping to the server.
function compareClients(
	a: SortableClient,
	b: SortableClient,
	sort: SortKey,
	sortDir: "asc" | "desc",
	getQsRank: (prefix: QsPrefix, clientId: number) => number,
): number {
	if (sort === "priority") return comparePriority(a, b);

	const dir = sortDir === "desc" ? -1 : 1;
	switch (sort) {
		case "status":
			return (
				compareStrings(
					a.status ? "Active" : "Inactive",
					b.status ? "Active" : "Inactive",
				) * dir
			);
		case "for":
			return compareStrings(a.asdAdhd, b.asdAdhd) * dir;
		case "language":
			return compareStrings(a.language, b.language) * dir;
		case "insurance":
			return compareStrings(a.primaryInsurance, b.primaryInsurance) * dir;
		case "secondaryInsurance":
			return (
				compareStrings(a.secondaryInsurance[0], b.secondaryInsurance[0]) * dir
			);
		case "daQs":
			return (getQsRank("DA", a.id) - getQsRank("DA", b.id)) * dir;
		case "evalQs":
			return (getQsRank("EVAL", a.id) - getQsRank("EVAL", b.id)) * dir;
		case "priorAuthDate":
			return compareDateOnly(a.priorAuthDate, b.priorAuthDate) * dir;
		case "daScheduled":
			return (Number(a.daScheduled) - Number(b.daScheduled)) * dir;
		case "evalScheduled":
			return (Number(a.evalScheduled) - Number(b.evalScheduled)) * dir;
		case "location":
			return compareStrings(a.location, b.location) * dir;
		case "evaluator":
			return compareStrings(a.evaluator, b.evaluator) * dir;
		case "paAssignedTo":
			return compareStrings(a.paAssignedTo, b.paAssignedTo) * dir;
		default:
			return compareStrings(a.fullName, b.fullName) * dir;
	}
}

function collapsibleCellClass(visible: boolean) {
	return cn(
		"transition-[width,padding] duration-200 ease-in-out",
		!visible && "w-0 overflow-hidden p-0",
	);
}

function AnimatedCellContent({
	visible,
	children,
}: {
	visible: boolean;
	children: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"overflow-x-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-in-out",
				visible ? "max-w-[240px] opacity-100" : "max-w-0 opacity-0",
			)}
		>
			{children}
		</div>
	);
}

function InfoField({
	label,
	value,
	highlight,
	wrap,
}: {
	label: string;
	value: React.ReactNode;
	highlight?: boolean;
	// Priority's text can run long (e.g. "High Priority, BabyNet: 2:6") and is
	// important enough that truncating it would hide the actual reason.
	wrap?: boolean;
}) {
	return (
		<div className={cn("min-w-0", wrap && "col-span-2")}>
			<div className="text-muted-foreground text-xs">{label}</div>
			<div
				className={cn(
					"text-muted-foreground",
					wrap ? "wrap-break-word" : "truncate",
					highlight && "font-medium text-destructive",
				)}
			>
				{value}
			</div>
		</div>
	);
}

interface FacetCounts {
	counts: Record<string, number>;
	total: number;
}

function withNone(options: FilterOption[]): FilterOption[] {
	return [...options, { value: NONE_FILTER_VALUE, label: "None" }];
}

interface ColumnSortProps {
	active: boolean;
	// Omitted for columns whose sort has no user-facing direction (e.g. priority).
	direction?: "asc" | "desc";
	onClick: () => void;
}

function SortButton({
	label,
	active,
	direction,
	onClick,
}: { label: string } & ColumnSortProps) {
	const SortIcon = direction
		? direction === "asc"
			? ArrowUp
			: ArrowDown
		: ArrowUpDown;

	return (
		<button
			className={cn(
				"flex items-center gap-1 transition-colors",
				active
					? "font-semibold text-primary"
					: "text-foreground hover:text-primary",
			)}
			onClick={onClick}
			type="button"
		>
			{label}
			<span
				className={cn(
					"flex items-center justify-center rounded p-0.5",
					active && "bg-primary/10",
				)}
			>
				<SortIcon
					className={cn(
						"h-3.5 w-3.5",
						active ? "text-primary" : "text-muted-foreground/60",
					)}
				/>
			</span>
		</button>
	);
}

interface DirectoryColumnFilterProps {
	label: string;
	values: string[];
	onToggle: (value: string) => void;
	onClear: () => void;
	options: FilterOption[];
	facet?: FacetCounts;
	sort?: ColumnSortProps;
}

// Thin adapter over the shared ColumnFilter: keeps this file's toggle/clear
// call sites while delegating the actual dropdown UI to the shared component.
function DirectoryColumnFilter({
	label,
	values,
	onToggle,
	onClear,
	options,
	facet,
	sort,
}: DirectoryColumnFilterProps) {
	return (
		<div className="flex items-center gap-1">
			{sort ? <SortButton label={label} {...sort} /> : label}
			<ColumnFilter
				columnName={label}
				counts={facet?.counts}
				onFilterChange={(newValues) => {
					if (newValues.length === 0) {
						onClear();
						return;
					}
					for (const value of newValues.filter((v) => !values.includes(v))) {
						onToggle(value);
					}
					for (const value of values.filter((v) => !newValues.includes(v))) {
						onToggle(value);
					}
				}}
				options={options}
				selectedValues={values}
			/>
		</div>
	);
}

const BASE_COLOR_OPTIONS: FilterOption[] = CLIENT_COLOR_KEYS.map((key) => ({
	value: key,
	label: formatColorName(key),
	swatch: getHexFromColor(key),
}));

// Folded into the Name column's color filter as an extra checkbox option
// rather than a second filter icon, so it lives inside the value namespace
// of `color`. Doesn't collide with real color keys.
const HAS_FAILURES_FILTER_VALUE = "__hasFailures__";
const HAS_FAILURES_FILTER_OPTION: FilterOption = {
	value: HAS_FAILURES_FILTER_VALUE,
	label: "Blockers",
};

interface DirectoryFilters {
	for?: string[];
	insurance?: string[];
	secondaryInsurance?: string[];
	language?: string[];
	status?: string;
	color?: string[];
	priority?: string[];
	daQs?: string[];
	evalQs?: string[];
	priorAuthDate?: string[];
	daScheduled?: string[];
	evalScheduled?: string[];
	location?: string[];
	evaluator?: string[];
	paAssignedTo?: string[];
	hasFailures?: boolean;
	sort?: string;
	sortDir?: string;
	columns?: Partial<Record<ToggleKey, boolean>>;
	columnOrder?: string[];
}

// Memoized so re-sorting/re-filtering (which produces a new `clients` array
// but reuses the same client objects) or toggling an unrelated column
// doesn't re-render every row's cells - only rows whose own props actually
// changed re-render.
// Renders a single reorderable column's cell content (just the inner span),
// shared by the desktop row and, via renderColumnField below, the mobile
// card - keeps both in sync with a single switch instead of two.
function renderColumnCellContent(
	key: ColumnKey,
	client: DirectoryClient,
	punchRow: PUNCH_SCHEMA | undefined,
	isPriority: boolean,
): React.ReactNode {
	switch (key) {
		case "priority":
			return (
				<span
					className={cn(
						"text-muted-foreground",
						isPriority && "font-medium text-destructive",
					)}
				>
					{isPriority
						? formatPriorityReason(client.sortReason, client.dob)
						: "—"}
				</span>
			);
		case "for":
			return (
				<span className="text-muted-foreground">{client.asdAdhd ?? "—"}</span>
			);
		case "language":
			return (
				<span className="text-muted-foreground">{client.language ?? "—"}</span>
			);
		case "daQs":
			return (
				<span className="text-muted-foreground">
					{getQsStage("DA", punchRow) ?? "—"}
				</span>
			);
		case "evalQs":
			return (
				<span className="text-muted-foreground">
					{getQsStage("EVAL", punchRow) ?? "—"}
				</span>
			);
		case "insurance":
			return (
				<span className="text-muted-foreground">
					{client.primaryInsurance ?? "—"}
				</span>
			);
		case "secondaryInsurance":
			return (
				<span className="text-muted-foreground">
					{client.secondaryInsurance.length > 0
						? client.secondaryInsurance.join(", ")
						: "—"}
				</span>
			);
		case "priorAuthDate":
			return (
				<span className="text-muted-foreground">
					{formatShortDate(client.priorAuthDate, "—")}
				</span>
			);
		case "daScheduled":
			return (
				<span className="text-muted-foreground">
					{client.daScheduled
						? formatShortInstantDate(client.daScheduledDate)
						: "—"}
				</span>
			);
		case "evalScheduled":
			return (
				<span className="text-muted-foreground">
					{client.evalScheduled
						? formatShortInstantDate(client.evalScheduledDate)
						: "—"}
				</span>
			);
		case "location":
			return (
				<span className="text-muted-foreground">{client.location ?? "—"}</span>
			);
		case "evaluator":
			return (
				<span className="text-muted-foreground">{client.evaluator ?? "—"}</span>
			);
		case "paAssignedTo":
			return (
				<span className="text-muted-foreground">
					{client.paAssignedTo || "—"}
				</span>
			);
		default:
			return null;
	}
}

const ClientTableRow = memo(function ClientTableRow({
	client,
	statusColumnVisible,
	visibleColumns,
	columnOrder,
	isScrolledLeft,
	punchRow,
}: {
	client: DirectoryClient;
	statusColumnVisible: boolean;
	visibleColumns: Record<ToggleKey, boolean>;
	columnOrder: ColumnKey[];
	isScrolledLeft: boolean;
	punchRow: PUNCH_SCHEMA | undefined;
}) {
	const isPriority = PRIORITY_REASONS.has(client.sortReason);

	return (
		<TableRow
			style={{
				contentVisibility: "auto",
				containIntrinsicSize: "auto 41px",
			}}
		>
			<TableCell
				className={cn(
					"sticky left-0 z-10 bg-background font-medium transition-shadow duration-200",
					isScrolledLeft && "shadow-lg",
				)}
			>
				<Link
					className="flex flex-wrap items-center gap-2 hover:underline"
					href={`/clients/${client.hash}`}
				>
					<span className="flex items-center gap-2">
						<span
							className="h-3 w-3 shrink-0 rounded-full"
							style={{
								backgroundColor: getHexFromColor(client.color),
							}}
						/>
						<Redact>{client.fullName}</Redact>
					</span>
					{visibleColumns[FAILURES_TOGGLE_KEY] &&
						client.unresolvedFailures.map((reason) => (
							<Badge
								className="max-w-[160px]"
								key={reason}
								title={reason}
								variant="destructive"
							>
								<span className="min-w-0 truncate">{reason}</span>
							</Badge>
						))}
				</Link>
			</TableCell>
			<TableCell className={collapsibleCellClass(statusColumnVisible)}>
				<AnimatedCellContent visible={statusColumnVisible}>
					<span className="text-muted-foreground">
						{client.status ? "Active" : "Inactive"}
					</span>
				</AnimatedCellContent>
			</TableCell>
			{columnOrder.map((key) => (
				<TableCell
					className={collapsibleCellClass(visibleColumns[key])}
					key={key}
				>
					<AnimatedCellContent visible={visibleColumns[key]}>
						{renderColumnCellContent(key, client, punchRow, isPriority)}
					</AnimatedCellContent>
				</TableCell>
			))}
		</TableRow>
	);
});

// Mobile counterpart to ClientTableRow - same memoization rationale.
// Mobile counterpart to renderColumnCellContent - same switch, but each case
// returns a full InfoField (with its own label/highlight/wrap) instead of a
// bare span, since the card layout has no separate header row to hold labels.
function renderColumnField(
	key: ColumnKey,
	client: DirectoryClient,
	punchRow: PUNCH_SCHEMA | undefined,
	isPriority: boolean,
): React.ReactNode {
	switch (key) {
		case "priority":
			return (
				<InfoField
					highlight={isPriority}
					key={key}
					label="Priority"
					value={
						isPriority
							? formatPriorityReason(client.sortReason, client.dob)
							: "—"
					}
					wrap
				/>
			);
		case "for":
			return <InfoField key={key} label="For" value={client.asdAdhd ?? "—"} />;
		case "language":
			return (
				<InfoField key={key} label="Language" value={client.language ?? "—"} />
			);
		case "daQs":
			return (
				<InfoField
					key={key}
					label="DA Qs"
					value={getQsStage("DA", punchRow) ?? "—"}
				/>
			);
		case "evalQs":
			return (
				<InfoField
					key={key}
					label="EVAL Qs"
					value={getQsStage("EVAL", punchRow) ?? "—"}
				/>
			);
		case "insurance":
			return (
				<InfoField
					key={key}
					label="Primary Insurance"
					value={client.primaryInsurance ?? "—"}
				/>
			);
		case "secondaryInsurance":
			return (
				<InfoField
					key={key}
					label="Secondary Insurance"
					value={
						client.secondaryInsurance.length > 0
							? client.secondaryInsurance.join(", ")
							: "—"
					}
				/>
			);
		case "priorAuthDate":
			return (
				<InfoField
					key={key}
					label="Prior Auth Date"
					value={formatShortDate(client.priorAuthDate, "—")}
				/>
			);
		case "daScheduled":
			return (
				<InfoField
					key={key}
					label="DA Scheduled"
					value={
						client.daScheduled
							? formatShortInstantDate(client.daScheduledDate)
							: "—"
					}
				/>
			);
		case "evalScheduled":
			return (
				<InfoField
					key={key}
					label="EVAL Scheduled"
					value={
						client.evalScheduled
							? formatShortInstantDate(client.evalScheduledDate)
							: "—"
					}
				/>
			);
		case "location":
			return (
				<InfoField key={key} label="Location" value={client.location ?? "—"} />
			);
		case "evaluator":
			return (
				<InfoField
					key={key}
					label="Evaluator"
					value={client.evaluator ?? "—"}
				/>
			);
		case "paAssignedTo":
			return (
				<InfoField
					key={key}
					label="PA Assigned To"
					value={client.paAssignedTo || "—"}
				/>
			);
		default:
			return null;
	}
}

const ClientCard = memo(function ClientCard({
	client,
	statusColumnVisible,
	visibleColumns,
	columnOrder,
	punchRow,
}: {
	client: DirectoryClient;
	statusColumnVisible: boolean;
	visibleColumns: Record<ToggleKey, boolean>;
	columnOrder: ColumnKey[];
	punchRow: PUNCH_SCHEMA | undefined;
}) {
	const isPriority = PRIORITY_REASONS.has(client.sortReason);

	return (
		<div
			className="rounded-lg border bg-card p-4 shadow-xs"
			style={{
				contentVisibility: "auto",
				containIntrinsicSize: "auto 220px",
			}}
		>
			<Link
				className="flex flex-wrap items-center gap-2 font-medium hover:underline"
				href={`/clients/${client.hash}`}
			>
				<span className="flex items-center gap-2">
					<span
						className="h-3 w-3 shrink-0 rounded-full"
						style={{
							backgroundColor: getHexFromColor(client.color),
						}}
					/>
					<Redact>{client.fullName}</Redact>
				</span>
				{visibleColumns[FAILURES_TOGGLE_KEY] &&
					client.unresolvedFailures.map((reason) => (
						<Badge
							className="max-w-[160px]"
							key={reason}
							title={reason}
							variant="destructive"
						>
							<span className="min-w-0 truncate">{reason}</span>
						</Badge>
					))}
			</Link>

			<div className="mt-3 grid grid-cols-2 gap-3">
				{statusColumnVisible && (
					<InfoField
						label="Status"
						value={client.status ? "Active" : "Inactive"}
					/>
				)}
				{columnOrder.map(
					(key) =>
						visibleColumns[key] &&
						renderColumnField(key, client, punchRow, isPriority),
				)}
			</div>
		</div>
	);
});

export function ClientDirectory() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [isNavPending, startNavTransition] = useTransition();
	// Matches Tailwind's `sm` breakpoint. Mounting only the relevant layout
	// (instead of rendering both and hiding one with CSS) roughly halves
	// per-row render work, since the unpaginated client list can be long.
	const isMobile = useMediaQuery("(max-width: 639px)");

	const getArrayParam = (key: string) => {
		const raw = searchParams.get(key);
		return raw ? raw.split(",").filter(Boolean) : [];
	};

	const asdAdhd = getArrayParam("for");
	const primaryInsurance = getArrayParam("insurance");
	const secondaryInsurance = getArrayParam("secondaryInsurance");
	const language = getArrayParam("language");
	const status = searchParams.get("status") ?? "active";
	const color = getArrayParam("color");
	const priority = getArrayParam("priority");
	const daQs = getArrayParam("daQs");
	const evalQs = getArrayParam("evalQs");
	const priorAuthDateFilter = getArrayParam("priorAuthDate");
	const daScheduledFilter = getArrayParam("daScheduled");
	const evalScheduledFilter = getArrayParam("evalScheduled");
	const locationFilter = getArrayParam("location");
	const evaluatorFilter = getArrayParam("evaluator");
	const paAssignedTo = getArrayParam("paAssignedTo");
	const hasFailures = searchParams.get("hasFailures") === "true";
	// "priority" is the default, matching the homepage client search sort.
	const rawSort = searchParams.get("sort");
	const sort: SortKey = isSortKey(rawSort) ? rawSort : "priority";
	// sortDir doesn't apply to "priority", which has a fixed internal order.
	const sortDir = (searchParams.get("sortDir") ?? "asc") as "asc" | "desc";

	// Tracks horizontal scroll so the sticky Name column can grow a shadow once
	// there's content scrolled behind it, matching SchedulingTable's pattern.
	const tableRef = useRef<HTMLDivElement>(null);
	const [isScrolledLeft, setIsScrolledLeft] = useState(false);
	useEffect(() => {
		const table = tableRef.current;
		if (!table) return;
		const handleScroll = () => setIsScrolledLeft(table.scrollLeft > 0);
		handleScroll();
		table.addEventListener("scroll", handleScroll);
		return () => table.removeEventListener("scroll", handleScroll);
	}, []);

	// Transient per-lookup search, not persisted to the URL or saved filters,
	// matching ClientsDashboard/GlobalClientSearch.
	const [nameSearch, setNameSearch] = useState("");
	const nameSearchInputRef = useRef<HTMLInputElement>(null);

	// Ctrl/Cmd+F focuses the directory search instead of opening the native
	// find bar, matching SchedulingTable's search box.
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() !== "f" || !(e.ctrlKey || e.metaKey)) return;
			e.preventDefault();
			nameSearchInputRef.current?.focus();
			nameSearchInputRef.current?.select();
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	const [isInitialized, setIsInitialized] = useState(false);
	const lastSavedFiltersRef = useRef("");

	const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE_COLUMNS);
	const [columnOrder, setColumnOrder] =
		useState<ColumnKey[]>(TOGGLEABLE_COLUMNS);

	const toggleColumn = (key: ToggleKey) => {
		setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
	};

	const moveColumn = (key: ColumnKey, direction: -1 | 1) => {
		setColumnOrder((prev) => {
			const index = prev.indexOf(key);
			const swapWith = index + direction;
			if (index === -1 || swapWith < 0 || swapWith >= prev.length) return prev;
			const current = prev[index];
			const target = prev[swapWith];
			if (current === undefined || target === undefined) return prev;
			const next = [...prev];
			next[index] = target;
			next[swapWith] = current;
			return next;
		});
	};

	// Hidden columns have their filters disabled, regardless of what's still in the URL
	const effectiveAsdAdhd = visibleColumns.for ? asdAdhd : [];
	const effectiveInsurance = visibleColumns.insurance ? primaryInsurance : [];
	const effectiveSecondaryInsurance = visibleColumns.secondaryInsurance
		? secondaryInsurance
		: [];
	const effectiveLanguage = visibleColumns.language ? language : [];
	const effectivePriority = visibleColumns.priority ? priority : [];
	const effectiveDaQs = visibleColumns.daQs ? daQs : [];
	const effectiveEvalQs = visibleColumns.evalQs ? evalQs : [];
	const effectivePriorAuthDateFilter = visibleColumns.priorAuthDate
		? priorAuthDateFilter
		: [];
	const effectiveDaScheduledFilter = visibleColumns.daScheduled
		? daScheduledFilter
		: [];
	const effectiveEvalScheduledFilter = visibleColumns.evalScheduled
		? evalScheduledFilter
		: [];
	const effectiveLocationFilter = visibleColumns.location ? locationFilter : [];
	const effectiveEvaluatorFilter = visibleColumns.evaluator
		? evaluatorFilter
		: [];
	const effectivePaAssignedTo = visibleColumns.paAssignedTo ? paAssignedTo : [];
	const effectiveHasFailures = visibleColumns[FAILURES_TOGGLE_KEY]
		? hasFailures
		: false;

	// The Status column only earns its keep when we're not already filtered to one status
	const statusColumnVisible = status === "all";

	// Hiding a column falls back to the name sort, same as filters do.
	const sortColumnVisible: Record<SortKey, boolean> = {
		name: true,
		status: statusColumnVisible,
		priority: visibleColumns.priority,
		for: visibleColumns.for,
		language: visibleColumns.language,
		daQs: visibleColumns.daQs,
		evalQs: visibleColumns.evalQs,
		insurance: visibleColumns.insurance,
		secondaryInsurance: visibleColumns.secondaryInsurance,
		priorAuthDate: visibleColumns.priorAuthDate,
		daScheduled: visibleColumns.daScheduled,
		evalScheduled: visibleColumns.evalScheduled,
		location: visibleColumns.location,
		evaluator: visibleColumns.evaluator,
		paAssignedTo: visibleColumns.paAssignedTo,
	};
	const effectiveSort: SortKey = sortColumnVisible[sort] ? sort : "name";

	const setSort = (newSort: SortKey, newDir: "asc" | "desc" = "asc") => {
		const params = new URLSearchParams(searchParams.toString());
		if (newSort === "priority") params.delete("sort");
		else params.set("sort", newSort);
		if (newSort === "priority" || newDir === "asc") params.delete("sortDir");
		else params.set("sortDir", newDir);
		// Sorting doesn't hit the network, but re-rendering every row still takes
		// a moment. Wrapping the navigation in a transition gives us isNavPending
		// so the table can visibly acknowledge the click while that work happens.
		startNavTransition(() => {
			router.push(`${pathname}?${params.toString()}`);
		});
	};

	const handleSortClick = (key: SortKey) => {
		if (key === "priority") {
			if (sort !== "priority") setSort("priority");
			return;
		}
		setSort(key, sort === key && sortDir === "asc" ? "desc" : "asc");
	};

	const columnSort = (key: SortKey): ColumnSortProps => ({
		active: effectiveSort === key,
		direction: key === "priority" || sort !== key ? undefined : sortDir,
		onClick: () => handleSortClick(key),
	});

	// Every URL param change below drives a network refetch (the directory
	// query and its facet counts aren't cheap), so wrapping the navigation in
	// a transition - same as setSort above - lets the table dim immediately
	// on click instead of waiting on a blocking render first.
	const updateParam = (key: string, value: string, defaultValue = "") => {
		const params = new URLSearchParams(searchParams.toString());
		if (value && value !== defaultValue) params.set(key, value);
		else params.delete(key);
		startNavTransition(() => {
			router.push(`${pathname}?${params.toString()}`);
		});
	};

	const toggleArrayParam = (key: string, value: string) => {
		const current = getArrayParam(key);
		const next = current.includes(value)
			? current.filter((v) => v !== value)
			: [...current, value];
		const params = new URLSearchParams(searchParams.toString());
		if (next.length > 0) params.set(key, next.join(","));
		else params.delete(key);
		startNavTransition(() => {
			router.push(`${pathname}?${params.toString()}`);
		});
	};

	const clearArrayParam = (key: string) => {
		const params = new URLSearchParams(searchParams.toString());
		params.delete(key);
		startNavTransition(() => {
			router.push(`${pathname}?${params.toString()}`);
		});
	};

	const hasActiveFilters = FILTER_PARAM_KEYS.some((key) =>
		searchParams.has(key),
	);

	const clearAllFilters = () => {
		const params = new URLSearchParams(searchParams.toString());
		for (const key of FILTER_PARAM_KEYS) params.delete(key);
		startNavTransition(() => {
			router.push(`${pathname}?${params.toString()}`);
		});
	};

	const { data: allInsurances } = api.insurances.getAll.useQuery();
	const { data: languageOptions } = api.clients.getUniqueLanguages.useQuery();
	const { data: punchData } = api.google.getPunch.useQuery();

	const punchByClientId = useMemo(() => {
		const map = new Map<string, NonNullable<typeof punchData>[number]>();
		for (const row of punchData ?? []) {
			if (row["Client ID"]) map.set(row["Client ID"], row);
		}
		return map;
	}, [punchData]);

	const { data: savedFiltersData } =
		api.sessions.getDirectoryFilters.useQuery();
	const saveFiltersMutation = api.sessions.saveDirectoryFilters.useMutation();

	// The raw parsed blob, ungated by the 24h expiry - used for the fields
	// (columns/columnOrder/sort/sortDir) that should persist indefinitely.
	const parsedSavedFilters = useMemo((): {
		savedAt: number;
		filters: DirectoryFilters;
	} | null => {
		if (!savedFiltersData?.directoryFilters) return null;
		try {
			const parsed = JSON.parse(savedFiltersData.directoryFilters);
			if (
				!parsed ||
				typeof parsed !== "object" ||
				typeof parsed.savedAt !== "number"
			) {
				return null;
			}
			return parsed;
		} catch {
			return null;
		}
	}, [savedFiltersData?.directoryFilters]);

	// Search filters expire after FILTER_TIMEOUT_MS so a user doesn't get stuck
	// with stale filters. Column visibility/order and sort are a layout
	// preference, not a filter, so they're read from parsedSavedFilters
	// directly below instead, with no expiry.
	const savedFilters = useMemo((): DirectoryFilters | null => {
		if (!parsedSavedFilters) return null;
		if (Date.now() - parsedSavedFilters.savedAt > FILTER_TIMEOUT_MS) {
			return null;
		}
		return parsedSavedFilters.filters ?? null;
	}, [parsedSavedFilters]);

	const savedView = parsedSavedFilters?.filters ?? null;

	// Apply saved filters and column visibility on first load if the URL doesn't
	// already specify any filters (columns aren't part of the URL, so they're
	// always restored from the saved blob regardless).
	useEffect(() => {
		if (isInitialized || savedFiltersData === undefined) return;

		const hasFilterParams = Array.from(searchParams.keys()).some(
			(key) => key !== "name",
		);

		if (!hasFilterParams) {
			const params = new URLSearchParams(searchParams.toString());
			if (savedFilters) {
				for (const [key, value] of Object.entries(savedFilters)) {
					if (
						key === "columns" ||
						key === "columnOrder" ||
						key === "sort" ||
						key === "sortDir"
					) {
						continue;
					}
					if (Array.isArray(value)) {
						if (value.length > 0) params.set(key, value.join(","));
					} else if (value) {
						params.set(key, value);
					}
				}
			}
			// Sort persists indefinitely, unlike the filters above.
			if (savedView?.sort) params.set("sort", savedView.sort);
			if (savedView?.sortDir) params.set("sortDir", savedView.sortDir);
			if (params.toString() !== searchParams.toString()) {
				router.replace(`${pathname}?${params.toString()}`);
			}
		}

		if (savedView?.columns) {
			setVisibleColumns({
				...DEFAULT_VISIBLE_COLUMNS,
				...savedView.columns,
			});
		}

		if (savedView?.columnOrder) {
			const saved = savedView.columnOrder.filter((key): key is ColumnKey =>
				(TOGGLEABLE_COLUMNS as string[]).includes(key),
			);
			// Any column added since this order was saved (e.g. a new column
			// shipped later) has nowhere in the saved list, so it goes at the end.
			const missing = TOGGLEABLE_COLUMNS.filter((key) => !saved.includes(key));
			setColumnOrder([...saved, ...missing]);
		}

		lastSavedFiltersRef.current = JSON.stringify(
			parsedSavedFilters?.filters ?? {},
		);
		setIsInitialized(true);
	}, [
		isInitialized,
		savedFiltersData,
		savedFilters,
		savedView,
		parsedSavedFilters,
		searchParams,
		pathname,
		router,
	]);

	// Persist filter and column visibility changes (name search is excluded, it's transient per-lookup)
	// biome-ignore lint/correctness/useExhaustiveDependencies: saveFiltersMutation.mutate is stable
	useEffect(() => {
		if (!isInitialized) return;

		const filtersToSave: DirectoryFilters = {};
		if (asdAdhd.length) filtersToSave.for = asdAdhd;
		if (primaryInsurance.length) filtersToSave.insurance = primaryInsurance;
		if (secondaryInsurance.length)
			filtersToSave.secondaryInsurance = secondaryInsurance;
		if (language.length) filtersToSave.language = language;
		if (status !== "active") filtersToSave.status = status;
		if (color.length) filtersToSave.color = color;
		if (priority.length) filtersToSave.priority = priority;
		if (daQs.length) filtersToSave.daQs = daQs;
		if (evalQs.length) filtersToSave.evalQs = evalQs;
		if (priorAuthDateFilter.length)
			filtersToSave.priorAuthDate = priorAuthDateFilter;
		if (daScheduledFilter.length) filtersToSave.daScheduled = daScheduledFilter;
		if (evalScheduledFilter.length)
			filtersToSave.evalScheduled = evalScheduledFilter;
		if (paAssignedTo.length) filtersToSave.paAssignedTo = paAssignedTo;
		if (hasFailures) filtersToSave.hasFailures = true;
		if (sort !== "priority") filtersToSave.sort = sort;
		if (sort !== "priority" && sortDir !== "asc")
			filtersToSave.sortDir = sortDir;
		if (
			JSON.stringify(visibleColumns) !== JSON.stringify(DEFAULT_VISIBLE_COLUMNS)
		) {
			filtersToSave.columns = visibleColumns;
		}
		if (JSON.stringify(columnOrder) !== JSON.stringify(TOGGLEABLE_COLUMNS)) {
			filtersToSave.columnOrder = columnOrder;
		}

		const serialized = JSON.stringify(filtersToSave);
		if (serialized === lastSavedFiltersRef.current) return;
		lastSavedFiltersRef.current = serialized;

		saveFiltersMutation.mutate({
			directoryFilters: JSON.stringify({
				filters: filtersToSave,
				savedAt: Date.now(),
			}),
		});
	}, [isInitialized, searchParams, visibleColumns, columnOrder]);

	// Sorting never touches the query: the full filtered result set is already
	// on the client (there's no pagination), so every column sorts instantly
	// against data already in memory instead of round-tripping to the server.
	const queryFilters = {
		nameSearch: nameSearch || undefined,
		asdAdhd: effectiveAsdAdhd.length ? effectiveAsdAdhd : undefined,
		primaryInsurance: effectiveInsurance.length
			? effectiveInsurance
			: undefined,
		secondaryInsurance: effectiveSecondaryInsurance.length
			? effectiveSecondaryInsurance
			: undefined,
		language: effectiveLanguage.length ? effectiveLanguage : undefined,
		status: status as "active" | "inactive" | "all",
		color: color.length ? (color as ClientColor[]) : undefined,
		priority: effectivePriority.length
			? (effectivePriority as ("highPriority" | "babyNet" | "both")[])
			: undefined,
	};

	// Keeps the previous rows on screen while a new filter loads instead of
	// flashing the loading skeleton and shifting column widths. isFetching
	// still dims the table so it's clear a new result is on the way.
	const {
		data: rawClients,
		isLoading,
		isFetching,
	} = api.clients.directory.useQuery(queryFilters, {
		placeholderData: (previousData) => previousData,
	});
	const { data: facetCounts } = api.clients.directoryFacetCounts.useQuery(
		queryFilters,
		{ placeholderData: (previousData) => previousData },
	);

	// DA Qs / EVAL Qs stage lives in the Google Sheets punchlist, not the DB,
	// so it can't be part of the SQL query and gets filtered here instead.
	const clients = useMemo(() => {
		if (!rawClients) return rawClients;

		const filtered = rawClients.filter((client) => {
			const punchRow = punchByClientId.get(String(client.id));

			if (effectiveDaQs.length > 0) {
				const stage = getQsStage("DA", punchRow) ?? NONE_FILTER_VALUE;
				if (!effectiveDaQs.includes(stage)) return false;
			}

			if (effectiveEvalQs.length > 0) {
				const stage = getQsStage("EVAL", punchRow) ?? NONE_FILTER_VALUE;
				if (!effectiveEvalQs.includes(stage)) return false;
			}

			if (effectivePriorAuthDateFilter.length > 0) {
				const has = client.priorAuthDate ? "yes" : "no";
				if (!effectivePriorAuthDateFilter.includes(has)) return false;
			}

			if (effectiveDaScheduledFilter.length > 0) {
				const has = client.daScheduled ? "yes" : "no";
				if (!effectiveDaScheduledFilter.includes(has)) return false;
			}

			if (effectiveEvalScheduledFilter.length > 0) {
				const has = client.evalScheduled ? "yes" : "no";
				if (!effectiveEvalScheduledFilter.includes(has)) return false;
			}

			if (effectiveLocationFilter.length > 0) {
				const location = client.location || NONE_FILTER_VALUE;
				if (!effectiveLocationFilter.includes(location)) return false;
			}

			if (effectiveEvaluatorFilter.length > 0) {
				const evaluator = client.evaluator || NONE_FILTER_VALUE;
				if (!effectiveEvaluatorFilter.includes(evaluator)) return false;
			}

			if (effectivePaAssignedTo.length > 0) {
				const assignedTo = client.paAssignedTo || NONE_FILTER_VALUE;
				if (!effectivePaAssignedTo.includes(assignedTo)) return false;
			}

			if (effectiveHasFailures && client.unresolvedFailures.length === 0) {
				return false;
			}

			return true;
		});

		const getQsRank = (prefix: QsPrefix, clientId: number) => {
			const stage = getQsStage(prefix, punchByClientId.get(String(clientId)));
			return stage ? (QS_STAGE_ORDER[stage] ?? -1) : -1;
		};

		return [...filtered].sort((a, b) =>
			compareClients(a, b, effectiveSort, sortDir, getQsRank),
		);
	}, [
		rawClients,
		punchByClientId,
		effectiveDaQs,
		effectiveEvalQs,
		effectivePriorAuthDateFilter,
		effectiveDaScheduledFilter,
		effectiveEvalScheduledFilter,
		effectiveLocationFilter,
		effectiveEvaluatorFilter,
		effectivePaAssignedTo,
		effectiveHasFailures,
		effectiveSort,
		sortDir,
	]);

	const insuranceOptions: FilterOption[] = useMemo(
		() =>
			(allInsurances ?? []).map((insurance) => ({
				value: insurance.shortName,
				label: insurance.shortName,
			})),
		[allInsurances],
	);

	const paAssignedToOptions: FilterOption[] = useMemo(() => {
		const names = new Set<string>();
		for (const client of rawClients ?? []) {
			if (client.paAssignedTo) names.add(client.paAssignedTo);
		}
		return toFilterOptions([...names].sort());
	}, [rawClients]);

	const locationOptions: FilterOption[] = useMemo(() => {
		const locations = new Set<string>();
		for (const client of rawClients ?? []) {
			if (client.location) locations.add(client.location);
		}
		return toFilterOptions([...locations].sort());
	}, [rawClients]);

	const evaluatorOptions: FilterOption[] = useMemo(() => {
		const evaluators = new Set<string>();
		for (const client of rawClients ?? []) {
			if (client.evaluator) evaluators.add(client.evaluator);
		}
		return toFilterOptions([...evaluators].sort());
	}, [rawClients]);

	// Merged into the color facet counts so the Name filter's combined
	// dropdown can show a count next to "Blockers" too.
	const nameFilterCounts = useMemo(() => {
		const hasFailuresCount = (rawClients ?? []).filter(
			(client) => client.unresolvedFailures.length > 0,
		).length;
		return {
			...facetCounts?.color.counts,
			[HAS_FAILURES_FILTER_VALUE]: hasFailuresCount,
		};
	}, [rawClients, facetCounts?.color.counts]);

	// One TableHead per reorderable column, keyed so they can be rendered in
	// whatever order `columnOrder` says instead of this declaration order.
	const columnHeaderCells: Record<ColumnKey, React.ReactNode> = {
		priority: (
			<TableHead
				className={collapsibleCellClass(visibleColumns.priority)}
				key="priority"
			>
				<AnimatedCellContent visible={visibleColumns.priority}>
					<DirectoryColumnFilter
						facet={facetCounts?.priority}
						label="Priority"
						onClear={() => clearArrayParam("priority")}
						onToggle={(value) => toggleArrayParam("priority", value)}
						options={PRIORITY_FILTER_OPTIONS}
						sort={columnSort("priority")}
						values={priority}
					/>
				</AnimatedCellContent>
			</TableHead>
		),
		for: (
			<TableHead className={collapsibleCellClass(visibleColumns.for)} key="for">
				<AnimatedCellContent visible={visibleColumns.for}>
					<DirectoryColumnFilter
						facet={facetCounts?.asdAdhd}
						label="For"
						onClear={() => clearArrayParam("for")}
						onToggle={(value) => toggleArrayParam("for", value)}
						options={withNone(toFilterOptions(ALLOWED_ASD_ADHD_VALUES))}
						sort={columnSort("for")}
						values={asdAdhd}
					/>
				</AnimatedCellContent>
			</TableHead>
		),
		language: (
			<TableHead
				className={collapsibleCellClass(visibleColumns.language)}
				key="language"
			>
				<AnimatedCellContent visible={visibleColumns.language}>
					<DirectoryColumnFilter
						facet={facetCounts?.language}
						label="Language"
						onClear={() => clearArrayParam("language")}
						onToggle={(value) => toggleArrayParam("language", value)}
						options={withNone(toFilterOptions(languageOptions ?? []))}
						sort={columnSort("language")}
						values={language}
					/>
				</AnimatedCellContent>
			</TableHead>
		),
		daQs: (
			<TableHead
				className={collapsibleCellClass(visibleColumns.daQs)}
				key="daQs"
			>
				<AnimatedCellContent visible={visibleColumns.daQs}>
					<DirectoryColumnFilter
						label="DA Qs"
						onClear={() => clearArrayParam("daQs")}
						onToggle={(value) => toggleArrayParam("daQs", value)}
						options={QS_FILTER_OPTIONS}
						sort={columnSort("daQs")}
						values={daQs}
					/>
				</AnimatedCellContent>
			</TableHead>
		),
		evalQs: (
			<TableHead
				className={collapsibleCellClass(visibleColumns.evalQs)}
				key="evalQs"
			>
				<AnimatedCellContent visible={visibleColumns.evalQs}>
					<DirectoryColumnFilter
						label="EVAL Qs"
						onClear={() => clearArrayParam("evalQs")}
						onToggle={(value) => toggleArrayParam("evalQs", value)}
						options={QS_FILTER_OPTIONS}
						sort={columnSort("evalQs")}
						values={evalQs}
					/>
				</AnimatedCellContent>
			</TableHead>
		),
		insurance: (
			<TableHead
				className={collapsibleCellClass(visibleColumns.insurance)}
				key="insurance"
			>
				<AnimatedCellContent visible={visibleColumns.insurance}>
					<DirectoryColumnFilter
						facet={facetCounts?.primaryInsurance}
						label="Primary Insurance"
						onClear={() => clearArrayParam("insurance")}
						onToggle={(value) => toggleArrayParam("insurance", value)}
						options={withNone(insuranceOptions)}
						sort={columnSort("insurance")}
						values={primaryInsurance}
					/>
				</AnimatedCellContent>
			</TableHead>
		),
		secondaryInsurance: (
			<TableHead
				className={collapsibleCellClass(visibleColumns.secondaryInsurance)}
				key="secondaryInsurance"
			>
				<AnimatedCellContent visible={visibleColumns.secondaryInsurance}>
					<DirectoryColumnFilter
						facet={facetCounts?.secondaryInsurance}
						label="Secondary Insurance"
						onClear={() => clearArrayParam("secondaryInsurance")}
						onToggle={(value) => toggleArrayParam("secondaryInsurance", value)}
						options={withNone(insuranceOptions)}
						sort={columnSort("secondaryInsurance")}
						values={secondaryInsurance}
					/>
				</AnimatedCellContent>
			</TableHead>
		),
		priorAuthDate: (
			<TableHead
				className={collapsibleCellClass(visibleColumns.priorAuthDate)}
				key="priorAuthDate"
			>
				<AnimatedCellContent visible={visibleColumns.priorAuthDate}>
					<DirectoryColumnFilter
						label="Prior Auth Date"
						onClear={() => clearArrayParam("priorAuthDate")}
						onToggle={(value) => toggleArrayParam("priorAuthDate", value)}
						options={YES_NO_FILTER_OPTIONS}
						sort={columnSort("priorAuthDate")}
						values={priorAuthDateFilter}
					/>
				</AnimatedCellContent>
			</TableHead>
		),
		daScheduled: (
			<TableHead
				className={collapsibleCellClass(visibleColumns.daScheduled)}
				key="daScheduled"
			>
				<AnimatedCellContent visible={visibleColumns.daScheduled}>
					<DirectoryColumnFilter
						label="DA Scheduled"
						onClear={() => clearArrayParam("daScheduled")}
						onToggle={(value) => toggleArrayParam("daScheduled", value)}
						options={YES_NO_FILTER_OPTIONS}
						sort={columnSort("daScheduled")}
						values={daScheduledFilter}
					/>
				</AnimatedCellContent>
			</TableHead>
		),
		evalScheduled: (
			<TableHead
				className={collapsibleCellClass(visibleColumns.evalScheduled)}
				key="evalScheduled"
			>
				<AnimatedCellContent visible={visibleColumns.evalScheduled}>
					<DirectoryColumnFilter
						label="EVAL Scheduled"
						onClear={() => clearArrayParam("evalScheduled")}
						onToggle={(value) => toggleArrayParam("evalScheduled", value)}
						options={YES_NO_FILTER_OPTIONS}
						sort={columnSort("evalScheduled")}
						values={evalScheduledFilter}
					/>
				</AnimatedCellContent>
			</TableHead>
		),
		location: (
			<TableHead
				className={collapsibleCellClass(visibleColumns.location)}
				key="location"
			>
				<AnimatedCellContent visible={visibleColumns.location}>
					<DirectoryColumnFilter
						label="Location"
						onClear={() => clearArrayParam("location")}
						onToggle={(value) => toggleArrayParam("location", value)}
						options={withNone(locationOptions)}
						sort={columnSort("location")}
						values={locationFilter}
					/>
				</AnimatedCellContent>
			</TableHead>
		),
		evaluator: (
			<TableHead
				className={collapsibleCellClass(visibleColumns.evaluator)}
				key="evaluator"
			>
				<AnimatedCellContent visible={visibleColumns.evaluator}>
					<DirectoryColumnFilter
						label="Evaluator"
						onClear={() => clearArrayParam("evaluator")}
						onToggle={(value) => toggleArrayParam("evaluator", value)}
						options={withNone(evaluatorOptions)}
						sort={columnSort("evaluator")}
						values={evaluatorFilter}
					/>
				</AnimatedCellContent>
			</TableHead>
		),
		paAssignedTo: (
			<TableHead
				className={collapsibleCellClass(visibleColumns.paAssignedTo)}
				key="paAssignedTo"
			>
				<AnimatedCellContent visible={visibleColumns.paAssignedTo}>
					<DirectoryColumnFilter
						label="PA Assigned To"
						onClear={() => clearArrayParam("paAssignedTo")}
						onToggle={(value) => toggleArrayParam("paAssignedTo", value)}
						options={withNone(paAssignedToOptions)}
						sort={columnSort("paAssignedTo")}
						values={paAssignedTo}
					/>
				</AnimatedCellContent>
			</TableHead>
		),
	};

	return (
		<div className="flex w-full min-w-0 flex-col gap-4 p-4 sm:h-[calc(100vh-2.5rem)] sm:overflow-hidden">
			<div className="flex items-baseline gap-2">
				<h1 className="font-bold text-lg">Client Directory</h1>
				<span className="text-muted-foreground text-sm">
					{isLoading
						? ""
						: `${clients?.length ?? 0} client${clients?.length === 1 ? "" : "s"}`}
				</span>
			</div>

			<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
				<div className="sm:max-w-xs sm:flex-1">
					<NameSearchInput
						initialValue={nameSearch}
						inputRef={nameSearchInputRef}
						onDebouncedChange={setNameSearch}
						placeholder="Search by name or ID"
					/>
				</div>
				<Select
					onValueChange={(value) => updateParam("status", value, "active")}
					value={status}
				>
					<SelectTrigger className="w-full sm:w-48">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="active">
							Active
							{facetCounts && ` (${facetCounts.status.counts.active ?? 0})`}
						</SelectItem>
						<SelectItem value="inactive">
							Inactive
							{facetCounts && ` (${facetCounts.status.counts.inactive ?? 0})`}
						</SelectItem>
						<SelectItem value="all">
							All{facetCounts && ` (${facetCounts.status.total})`}
						</SelectItem>
					</SelectContent>
				</Select>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button className="w-full sm:w-auto" size="sm" variant="outline">
							<Columns3 className="h-4 w-4" />
							Columns
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="min-w-56">
						<DropdownMenuCheckboxItem
							checked={visibleColumns[FAILURES_TOGGLE_KEY]}
							onCheckedChange={() => toggleColumn(FAILURES_TOGGLE_KEY)}
							onSelect={(e) => e.preventDefault()}
						>
							{ALL_TOGGLE_LABELS[FAILURES_TOGGLE_KEY]}
						</DropdownMenuCheckboxItem>
						<DropdownMenuSeparator />
						{columnOrder.map((key, index) => (
							<div
								className="flex items-center gap-1.5 rounded-md py-1 pr-1 pl-1.5 text-sm"
								key={key}
							>
								<Checkbox
									checked={visibleColumns[key]}
									id={`column-${key}`}
									onCheckedChange={() => toggleColumn(key)}
								/>
								<label
									className="flex-1 cursor-pointer select-none"
									htmlFor={`column-${key}`}
								>
									{COLUMN_LABELS[key]}
								</label>
								<Button
									className="h-6 w-6"
									disabled={index === 0}
									onClick={() => moveColumn(key, -1)}
									size="icon"
									type="button"
									variant="ghost"
								>
									<ArrowUp className="h-3.5 w-3.5" />
									<span className="sr-only">Move {COLUMN_LABELS[key]} up</span>
								</Button>
								<Button
									className="h-6 w-6"
									disabled={index === columnOrder.length - 1}
									onClick={() => moveColumn(key, 1)}
									size="icon"
									type="button"
									variant="ghost"
								>
									<ArrowDown className="h-3.5 w-3.5" />
									<span className="sr-only">
										Move {COLUMN_LABELS[key]} down
									</span>
								</Button>
							</div>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
				{hasActiveFilters && (
					<Button
						className="w-full sm:w-auto"
						onClick={clearAllFilters}
						size="sm"
						variant="outline"
					>
						<X className="h-4 w-4" />
						Clear filters
					</Button>
				)}
			</div>

			{!isMobile && (
				<Table
					className={cn(
						"transition-opacity duration-150",
						((isFetching && !isLoading) || isNavPending) && "opacity-50",
					)}
					classNameWrapper="min-h-0 sm:flex-1"
					ref={tableRef}
				>
					<TableHeader className="sticky top-0 z-20 bg-background">
						<TableRow>
							<TableHead
								className={cn(
									"sticky left-0 z-10 bg-background transition-shadow duration-200",
									isScrolledLeft && "shadow-lg",
								)}
							>
								<div className="flex items-center gap-1">
									<SortButton label="Name" {...columnSort("name")} />
									<ColumnFilter
										columnName="Name"
										counts={nameFilterCounts}
										onFilterChange={(newValues) => {
											const wantsFailures = newValues.includes(
												HAS_FAILURES_FILTER_VALUE,
											);
											if (wantsFailures !== hasFailures) {
												updateParam("hasFailures", wantsFailures ? "true" : "");
												return;
											}
											const newColors = newValues.filter(
												(v) => v !== HAS_FAILURES_FILTER_VALUE,
											);
											if (newColors.length === 0) {
												clearArrayParam("color");
												return;
											}
											for (const value of newColors.filter(
												(v) => !color.includes(v),
											)) {
												toggleArrayParam("color", value);
											}
											for (const value of color.filter(
												(v) => !newColors.includes(v),
											)) {
												toggleArrayParam("color", value);
											}
										}}
										options={
											visibleColumns[FAILURES_TOGGLE_KEY]
												? [...BASE_COLOR_OPTIONS, HAS_FAILURES_FILTER_OPTION]
												: BASE_COLOR_OPTIONS
										}
										selectedValues={
											hasFailures
												? [...color, HAS_FAILURES_FILTER_VALUE]
												: color
										}
									/>
								</div>
							</TableHead>
							<TableHead className={collapsibleCellClass(statusColumnVisible)}>
								<AnimatedCellContent visible={statusColumnVisible}>
									<SortButton label="Status" {...columnSort("status")} />
								</AnimatedCellContent>
							</TableHead>
							{columnOrder.map((key) => columnHeaderCells[key])}
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							Array.from({ length: 5 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
								<TableRow key={i}>
									<TableCell className="sticky left-0 z-10 bg-background">
										<Skeleton className="h-4 w-40" />
									</TableCell>
									<TableCell
										className={collapsibleCellClass(statusColumnVisible)}
									>
										<AnimatedCellContent visible={statusColumnVisible}>
											<Skeleton className="h-4 w-20" />
										</AnimatedCellContent>
									</TableCell>
									{TOGGLEABLE_COLUMNS.map((key) => (
										<TableCell
											className={collapsibleCellClass(visibleColumns[key])}
											key={key}
										>
											<AnimatedCellContent visible={visibleColumns[key]}>
												<Skeleton className="h-4 w-20" />
											</AnimatedCellContent>
										</TableCell>
									))}
								</TableRow>
							))
						) : clients && clients.length > 0 ? (
							clients.map((client) => (
								<ClientTableRow
									client={client}
									columnOrder={columnOrder}
									isScrolledLeft={isScrolledLeft}
									key={client.id}
									punchRow={punchByClientId.get(String(client.id))}
									statusColumnVisible={statusColumnVisible}
									visibleColumns={visibleColumns}
								/>
							))
						) : (
							<TableRow>
								<TableCell
									className="py-12 text-center"
									colSpan={2 + TOGGLEABLE_COLUMNS.length}
								>
									<p className="text-muted-foreground text-sm">
										No clients found.
									</p>
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			)}

			{isMobile && (
				<div
					className={cn(
						"flex flex-col gap-3 transition-opacity duration-150",
						((isFetching && !isLoading) || isNavPending) && "opacity-50",
					)}
				>
					{isLoading ? (
						Array.from({ length: 5 }).map((_, i) => (
							<div
								className="rounded-lg border bg-card p-4 shadow-xs"
								// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
								key={i}
							>
								<Skeleton className="h-4 w-40" />
								<div className="mt-3 grid grid-cols-2 gap-3">
									<Skeleton className="h-8 w-full" />
									<Skeleton className="h-8 w-full" />
								</div>
							</div>
						))
					) : clients && clients.length > 0 ? (
						clients.map((client) => (
							<ClientCard
								client={client}
								columnOrder={columnOrder}
								key={client.id}
								punchRow={punchByClientId.get(String(client.id))}
								statusColumnVisible={statusColumnVisible}
								visibleColumns={visibleColumns}
							/>
						))
					) : (
						<p className="py-12 text-center text-muted-foreground text-sm">
							No clients found.
						</p>
					)}
				</div>
			)}
		</div>
	);
}

"use client";

import {
	ColumnFilter,
	type FilterOption,
} from "@components/shared/ColumnFilter";
import { EmptyState } from "@components/shared/EmptyState";
import { ErrorState } from "@components/shared/ErrorState";
import type { inferRouterOutputs } from "@trpc/server";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Skeleton } from "@ui/skeleton";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@ui/table";
import { CalendarX, X } from "lucide-react";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import {
	fuzzyNameRowMatches,
	nameSearchWords,
} from "~/lib/clients/name-search";
import { evaluatorDisplayName, formatInBusinessTime } from "~/lib/utils";
import type { AppRouter } from "~/server/api/root";
import { api } from "~/trpc/react";
import {
	CLIENT_STATUS_OPTIONS,
	ClientLink,
	clientStatusValue,
	countBy,
	FIXED_TABLE,
	FixedCols,
	SortableHead,
	type SortDir,
	SpacerRow,
	useSavedView,
	useVirtualRows,
	VIRTUAL_TABLE_HEADER,
	VIRTUAL_TABLE_HEIGHT,
} from "./shared";

type AppointmentRow =
	inferRouterOutputs<AppRouter>["workSummary"]["listAppointments"][number];

const NOT_RECORDED = "Not recorded";
const OUT_OF_ORDER = "Out of order";

function toOptions(labels: string[]): FilterOption[] {
	return labels.map((label) => ({ value: label, label }));
}

const STATUS_OPTIONS = toOptions(["Scheduled", "Cancelled"]);

const TYPE_LABELS: Record<string, string> = {
	DA: "DA",
	EVAL: "Eval",
	DAEVAL: "DA+Eval",
};
const TYPE_OPTIONS: FilterOption[] = Object.entries(TYPE_LABELS).map(
	([value, label]) => ({ value, label }),
);

// Logged and late start are filtered by range, since exact minutes rarely match.
const LOGGED_OPTIONS = toOptions([
	"Recorded",
	"Under 60 min",
	"60 to 119 min",
	"120 to 179 min",
	"180 min or more",
	OUT_OF_ORDER,
	NOT_RECORDED,
]);
const LATE_START_OPTIONS = toOptions([
	"Recorded",
	"On time or early",
	"1 to 5 min late",
	"6 to 15 min late",
	"16 min or more late",
	NOT_RECORDED,
]);
const VS_PROJECTED_OPTIONS = toOptions([
	"Recorded",
	"15 min or more over",
	"1 to 14 min over",
	"On projection",
	"1 to 14 min under",
	"15 min or more under",
	NOT_RECORDED,
]);
const RECORDED = "Recorded";
const RECORDED_OPTIONS = toOptions([RECORDED, NOT_RECORDED]);

function loggedRange(minutes: number | undefined): string {
	if (minutes === undefined) return NOT_RECORDED;
	const rounded = Math.round(minutes);
	if (rounded < 60) return "Under 60 min";
	if (rounded < 120) return "60 to 119 min";
	if (rounded < 180) return "120 to 179 min";
	return "180 min or more";
}

function lateStartRange(minutes: number | undefined): string {
	if (minutes === undefined) return NOT_RECORDED;
	const rounded = Math.round(minutes);
	if (rounded <= 0) return "On time or early";
	if (rounded <= 5) return "1 to 5 min late";
	if (rounded <= 15) return "6 to 15 min late";
	return "16 min or more late";
}

// Logged minutes, unless the left time is before the started time. Check-in
// times are entered by hand, so that happens, and the length is meaningless.
function validLogged(row: AppointmentRow): number | undefined {
	return row.loggedMinutes !== undefined && row.loggedMinutes >= 0
		? row.loggedMinutes
		: undefined;
}

function isOutOfOrder(row: AppointmentRow): boolean {
	return row.loggedMinutes !== undefined && row.loggedMinutes < 0;
}

// Logged minus projected minutes, when both are known.
function overProjected(row: AppointmentRow): number | undefined {
	const logged = validLogged(row);
	if (logged === undefined || row.projectedMinutes === undefined) {
		return undefined;
	}
	return logged - row.projectedMinutes;
}

function vsProjectedRange(minutes: number | undefined): string {
	if (minutes === undefined) return NOT_RECORDED;
	const rounded = Math.round(minutes);
	if (rounded >= 15) return "15 min or more over";
	if (rounded >= 1) return "1 to 14 min over";
	if (rounded === 0) return "On projection";
	if (rounded > -15) return "1 to 14 min under";
	return "15 min or more under";
}

// A value that is present also matches the "Recorded" option, so one tick
// shows every row with any value instead of ticking each range.
function withRecorded(value: string): string[] {
	return value === NOT_RECORDED ? [value] : [RECORDED, value];
}

function timeState(time: Date | null): string[] {
	return [time ? RECORDED : NOT_RECORDED];
}

// Each filter's values for a row. Rows match a filter when it has no selection
// or its selection includes one of the row's values.
const FILTER_VALUES = {
	statuses: (row: AppointmentRow) => [row.status],
	clientStatuses: (row: AppointmentRow) => [clientStatusValue(row)],
	evaluators: (row: AppointmentRow) => [String(row.evaluatorNpi)],
	types: (row: AppointmentRow) => [row.daEval ?? ""],
	logged: (row: AppointmentRow) =>
		isOutOfOrder(row)
			? [OUT_OF_ORDER]
			: withRecorded(loggedRange(validLogged(row))),
	vsProjected: (row: AppointmentRow) =>
		withRecorded(vsProjectedRange(overProjected(row))),
	lateStart: (row: AppointmentRow) =>
		withRecorded(lateStartRange(row.lateStartMinutes)),
	arrived: (row: AppointmentRow) => timeState(row.arrivedAt),
	started: (row: AppointmentRow) => timeState(row.startedAt),
	left: (row: AppointmentRow) => timeState(row.leftAt),
};

type FilterKey = keyof typeof FILTER_VALUES;
type Filters = Record<FilterKey, string[]>;

const FILTER_KEYS = Object.keys(FILTER_VALUES) as FilterKey[];

// Cancelled visits stay hidden until the viewer asks for them.
const DEFAULT_FILTERS: Filters = {
	statuses: ["Scheduled"],
	clientStatuses: ["active"],
	evaluators: [],
	types: [],
	logged: [],
	vsProjected: [],
	lateStart: [],
	arrived: [],
	started: [],
	left: [],
};

// Each filter is skipped when `except` names it, so a filter's own counts
// reflect every other active filter but not its own selection.
function matchesFilters(
	row: AppointmentRow,
	filters: Filters,
	except?: FilterKey,
): boolean {
	return FILTER_KEYS.every((key) => {
		if (key === except || filters[key].length === 0) return true;
		return FILTER_VALUES[key](row).some((v) => filters[key].includes(v));
	});
}

type SortKey =
	| "date"
	| "status"
	| "client"
	| "evaluator"
	| "type"
	| "projected"
	| "logged"
	| "vsProjected"
	| "lateStart"
	| "arrived"
	| "started"
	| "left";

function compareNumbers(a: number | undefined, b: number | undefined): number {
	return (a ?? -Infinity) - (b ?? -Infinity);
}

function compareTimes(a: Date | null, b: Date | null): number {
	return compareNumbers(a?.getTime(), b?.getTime());
}

function compareRows(
	a: AppointmentRow,
	b: AppointmentRow,
	sort: SortKey,
): number {
	switch (sort) {
		case "status":
			return a.status.localeCompare(b.status);
		case "date":
			return a.startTime.getTime() - b.startTime.getTime();
		case "client":
			return a.clientName.localeCompare(b.clientName);
		case "evaluator":
			return a.evaluatorName.localeCompare(b.evaluatorName);
		case "type":
			return (a.daEval ?? "").localeCompare(b.daEval ?? "");
		case "projected":
			return compareNumbers(a.projectedMinutes, b.projectedMinutes);
		case "logged":
			return compareNumbers(validLogged(a), validLogged(b));
		case "vsProjected":
			return compareNumbers(overProjected(a), overProjected(b));
		case "lateStart":
			return compareNumbers(a.lateStartMinutes, b.lateStartMinutes);
		case "arrived":
			return compareTimes(a.arrivedAt, b.arrivedAt);
		case "started":
			return compareTimes(a.startedAt, b.startedAt);
		case "left":
			return compareTimes(a.leftAt, b.leftAt);
	}
}

function formatMinutes(minutes: number | undefined): string {
	return minutes === undefined ? "—" : `${Math.round(minutes)} min`;
}

// Signed difference spelled out in words, so the sign never has to be decoded.
function formatDifference(
	minutes: number | undefined,
	positive: string,
	negative: string,
	zero: string,
): string {
	if (minutes === undefined) return "—";
	const rounded = Math.round(minutes);
	if (rounded === 0) return zero;
	return `${Math.abs(rounded)} min ${rounded > 0 ? positive : negative}`;
}

function formatTime(date: Date | null): string {
	return date ? formatInBusinessTime(date, "h:mm a") : "—";
}

function formatDiagnosis(row: AppointmentRow): string {
	const type = row.daEval ? (TYPE_LABELS[row.daEval] ?? row.daEval) : "—";
	return row.asdAdhd && row.daEval !== "DA" ? `${type} (${row.asdAdhd})` : type;
}

export function AppointmentsDataView() {
	const { data, isLoading, isError, refetch } =
		api.workSummary.listAppointments.useQuery();

	const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
	const [sort, setSort] = useState<SortKey>("date");
	const [sortDir, setSortDir] = useState<SortDir>("desc");
	const [clientSearch, setClientSearch] = useState("");

	useSavedView("appointments", { filters, sort, sortDir }, (saved) => {
		if (saved.filters) setFilters({ ...DEFAULT_FILTERS, ...saved.filters });
		if (saved.sort) setSort(saved.sort);
		if (saved.sortDir) setSortDir(saved.sortDir);
	});

	const rows = useMemo(() => data ?? [], [data]);
	const deferredFilters = useDeferredValue(filters);

	const deferredSearch = useDeferredValue(clientSearch);
	const searchWords = useMemo(
		() => nameSearchWords(deferredSearch.trim()),
		[deferredSearch],
	);
	const matchesAll = useCallback(
		(row: AppointmentRow, except?: FilterKey) =>
			fuzzyNameRowMatches(searchWords, row.clientName) &&
			matchesFilters(row, deferredFilters, except),
		[searchWords, deferredFilters],
	);

	const evaluatorOptions = useMemo(() => {
		const byNpi = new Map<string, string>();
		for (const row of rows)
			byNpi.set(
				String(row.evaluatorNpi),
				evaluatorDisplayName(row.evaluatorName),
			);
		return [...byNpi].map(([value, label]) => ({ value, label }));
	}, [rows]);

	const setFilter = (key: FilterKey, value: string[]) => {
		setFilters((prev) => ({ ...prev, [key]: value }));
	};

	const handleSort = (key: SortKey) => {
		if (key === sort) {
			setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
			return;
		}
		setSort(key);
		setSortDir(key === "client" || key === "evaluator" ? "asc" : "desc");
	};

	const hasActiveFilters = FILTER_KEYS.some((key) => {
		const selected = filters[key];
		const defaults = DEFAULT_FILTERS[key];
		return (
			selected.length !== defaults.length ||
			!defaults.every((value) => selected.includes(value))
		);
	});

	const visibleRows = useMemo(() => {
		const dir = sortDir === "asc" ? 1 : -1;
		return rows
			.filter((row) => matchesAll(row))
			.sort((a, b) => compareRows(a, b, sort) * dir);
	}, [rows, matchesAll, sort, sortDir]);

	const { scrollRef, items, measureElement, paddingTop, paddingBottom } =
		useVirtualRows(visibleRows.length, 49);

	const counts = useMemo(
		() =>
			Object.fromEntries(
				FILTER_KEYS.map((key) => [
					key,
					countBy(
						rows
							.filter((row) => matchesAll(row, key))
							.flatMap((row) => FILTER_VALUES[key](row)),
						(value) => value,
					),
				]),
			) as Record<FilterKey, Record<string, number>>,
		[rows, matchesAll],
	);

	if (isError) {
		return (
			<ErrorState
				message="Could not load appointments."
				onRetry={() => refetch()}
			/>
		);
	}

	if (isLoading) {
		return (
			<div className="flex flex-col gap-2">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-96 w-full" />
			</div>
		);
	}

	const sortProps = { onSort: handleSort, sort, sortDir };

	const filterFor = (
		key: FilterKey,
		columnName: string,
		options: FilterOption[],
	) => (
		<ColumnFilter
			columnName={columnName}
			counts={counts[key]}
			defaultValues={DEFAULT_FILTERS[key]}
			keepOrder
			onFilterChange={(values) => setFilter(key, values)}
			options={options}
			selectedValues={filters[key]}
		/>
	);

	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				<Input
					className="h-9 w-64"
					onChange={(e) => setClientSearch(e.target.value)}
					placeholder="Search client..."
					value={clientSearch}
				/>
				{(hasActiveFilters || clientSearch) && (
					<Button
						onClick={() => {
							setFilters(DEFAULT_FILTERS);
							setClientSearch("");
						}}
						size="sm"
						variant="ghost"
					>
						<X className="h-4 w-4" />
						Clear filters
					</Button>
				)}
				<p className="ml-auto text-sm text-muted-foreground">
					{visibleRows.length} appointments
				</p>
			</div>

			<div className="rounded-lg border">
				<Table
					className={`${FIXED_TABLE} min-w-[1600px]`}
					classNameWrapper={VIRTUAL_TABLE_HEIGHT}
					ref={scrollRef}
				>
					<FixedCols widths={[8, 7, 12, 10, 7, 8, 8, 9, 9, 8, 8, 6]} />
					<TableHeader className={VIRTUAL_TABLE_HEADER}>
						<TableRow>
							<SortableHead {...sortProps} label="Date" sortKey="date" />
							<SortableHead
								{...sortProps}
								filter={filterFor("statuses", "Status", STATUS_OPTIONS)}
								label="Status"
								sortKey="status"
							/>
							<SortableHead
								{...sortProps}
								filter={filterFor(
									"clientStatuses",
									"Client Status",
									CLIENT_STATUS_OPTIONS,
								)}
								label="Client"
								sortKey="client"
							/>
							<SortableHead
								{...sortProps}
								filter={filterFor("evaluators", "Evaluator", evaluatorOptions)}
								label="Evaluator"
								sortKey="evaluator"
							/>
							<SortableHead
								{...sortProps}
								filter={filterFor("types", "Type", TYPE_OPTIONS)}
								label="Type"
								sortKey="type"
							/>
							<SortableHead
								{...sortProps}
								label="Projected"
								sortKey="projected"
							/>
							<SortableHead
								{...sortProps}
								filter={filterFor("logged", "Logged", LOGGED_OPTIONS)}
								label="Logged"
								sortKey="logged"
							/>
							<SortableHead
								{...sortProps}
								filter={filterFor(
									"vsProjected",
									"vs Projected",
									VS_PROJECTED_OPTIONS,
								)}
								label="vs Projected"
								sortKey="vsProjected"
							/>
							<SortableHead
								{...sortProps}
								filter={filterFor(
									"lateStart",
									"Late Start",
									LATE_START_OPTIONS,
								)}
								label="Late Start"
								sortKey="lateStart"
							/>
							<SortableHead
								{...sortProps}
								filter={filterFor("arrived", "Arrived", RECORDED_OPTIONS)}
								label="Arrived"
								sortKey="arrived"
							/>
							<SortableHead
								{...sortProps}
								filter={filterFor("started", "Started", RECORDED_OPTIONS)}
								label="Started"
								sortKey="started"
							/>
							<SortableHead
								{...sortProps}
								filter={filterFor("left", "Left", RECORDED_OPTIONS)}
								label="Left"
								sortKey="left"
							/>
						</TableRow>
					</TableHeader>
					<TableBody>
						{visibleRows.length === 0 ? (
							<TableRow>
								<TableCell colSpan={12}>
									<EmptyState
										description={
											hasActiveFilters ? "Try removing a filter." : undefined
										}
										icon={CalendarX}
										title="No appointments found"
									/>
								</TableCell>
							</TableRow>
						) : (
							<>
								<SpacerRow colSpan={12} height={paddingTop} />
								{items.map((item) => {
									const row = visibleRows[item.index];
									if (!row) return null;
									return (
										<TableRow
											data-index={item.index}
											key={row.id}
											ref={measureElement}
										>
											<TableCell>
												{formatInBusinessTime(row.startTime, "MMM d, yyyy")}
												<div className="text-xs text-muted-foreground">
													{formatInBusinessTime(row.startTime, "h:mm a")}
												</div>
											</TableCell>
											<TableCell className="text-muted-foreground">
												{row.status}
											</TableCell>
											<TableCell className="truncate">
												<ClientLink
													active={row.clientActive}
													hash={row.clientHash}
													name={row.clientName}
												/>
											</TableCell>
											<TableCell className="truncate">
												{evaluatorDisplayName(row.evaluatorName)}
											</TableCell>
											<TableCell>{formatDiagnosis(row)}</TableCell>
											<TableCell className="text-muted-foreground">
												{formatMinutes(row.projectedMinutes)}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{isOutOfOrder(row)
													? OUT_OF_ORDER
													: formatMinutes(row.loggedMinutes)}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{formatDifference(
													overProjected(row),
													"over",
													"under",
													"On projection",
												)}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{formatDifference(
													row.lateStartMinutes,
													"late",
													"early",
													"On time",
												)}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{formatTime(row.arrivedAt)}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{formatTime(row.startedAt)}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{formatTime(row.leftAt)}
											</TableCell>
										</TableRow>
									);
								})}
								<SpacerRow colSpan={12} height={paddingBottom} />
							</>
						)}
					</TableBody>
				</Table>
			</div>
		</>
	);
}

"use client";

import { PdfStatus } from "@components/client/questionnaires/PdfStatus";
import { Redact } from "@components/redaction/Redact";
import {
	ColumnFilter,
	type FilterOption,
	toFilterOptions,
} from "@components/shared/ColumnFilter";
import { EmptyState } from "@components/shared/EmptyState";
import { ErrorState } from "@components/shared/ErrorState";
import type { inferRouterOutputs } from "@trpc/server";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Skeleton } from "@ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@ui/table";
import { ToggleGroup, ToggleGroupItem } from "@ui/toggle-group";
import { addDays } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import {
	ChevronDown,
	ChevronRight,
	ClipboardList,
	RefreshCw,
	X,
} from "lucide-react";
import { Fragment, useDeferredValue, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	fuzzyNameRowMatches,
	nameSearchWords,
} from "~/lib/clients/name-search";
import { BUSINESS_TIMEZONE, QUESTIONNAIRE_STATUSES } from "~/lib/constants";
import { statusLabel } from "~/lib/questionnaires/questionnaire-history";
import {
	cn,
	compareDateOnly,
	formatInBusinessTime,
	formatShortDate,
	formatShortInstantDate,
	getReminderColorClass,
	getStatusColorClass,
} from "~/lib/utils";
import type { AppRouter } from "~/server/api/root";
import { api } from "~/trpc/react";
import {
	CLIENT_STATUS_OPTIONS,
	ClientLink,
	clientStatusFilterChanged,
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

type QuestionnaireRow =
	inferRouterOutputs<AppRouter>["questionnaires"]["listAll"][number];
type StatusValue = (typeof QUESTIONNAIRE_STATUSES)[number];

// Status shown when a row's status is null in the database.
const UNSET_STATUS = "PENDING";

// A questionnaire in one of these statuses counts toward a client's progress.
const DONE_STATUSES: string[] = ["COMPLETED", "EXTERNAL"];

const REMINDED_OPTIONS: FilterOption[] = [
	{ value: "0", label: "Never" },
	{ value: "1", label: "1" },
	{ value: "2", label: "2" },
	{ value: "3+", label: "3 or more" },
];

type PdfState = "found" | "missing" | "unchecked";

type AppointmentState = "past" | "soon" | "later" | "none";

const APPOINTMENT_OPTIONS: FilterOption[] = [
	{ value: "past", label: "Past" },
	{ value: "soon", label: "Through tomorrow" },
	{ value: "later", label: "Later" },
	{ value: "none", label: "None" },
];

// Appointments before this instant (the start of the day after tomorrow,
// business time) are past or tomorrow at the latest. Cached per minute because
// every row and every filter count asks for it.
let cutoffCache: { minute: number; cutoff: Date } | null = null;
function laterAppointmentCutoff(): Date {
	const minute = Math.floor(Date.now() / 60_000);
	if (cutoffCache?.minute !== minute) {
		const dayAfterTomorrow = formatInBusinessTime(
			addDays(new Date(), 2),
			"yyyy-MM-dd",
		);
		cutoffCache = {
			minute,
			cutoff: fromZonedTime(dayAfterTomorrow, BUSINESS_TIMEZONE),
		};
	}
	return cutoffCache.cutoff;
}

const PDF_OPTIONS: FilterOption[] = [
	{ value: "found", label: "Found" },
	{ value: "missing", label: "Missing" },
	{ value: "unchecked", label: "Not checked" },
];

// Sorting by PDF puts the ones that need attention first.
const PDF_RANK: Record<PdfState, number> = {
	missing: 0,
	unchecked: 1,
	found: 2,
};

type RowSortKey =
	| "client"
	| "type"
	| "status"
	| "sent"
	| "reminded"
	| "lastReminded"
	| "pdf"
	| "appointment";

type GroupSortKey = "client" | "progress" | "oldestSent" | "maxReminded";

type ViewMode = "rows" | "clients";

interface Filters {
	search: string;
	statuses: string[];
	types: string[];
	clientStatuses: string[];
	reminded: string[];
	pdfs: string[];
	appointments: string[];
}

const EMPTY_FILTERS: Filters = {
	search: "",
	statuses: [],
	types: [],
	clientStatuses: [],
	reminded: [],
	pdfs: [],
	appointments: [],
};

// Only active clients, and only those whose appointment is past or no later
// than tomorrow, are shown until the viewer changes those filters.
const DEFAULT_FILTERS: Filters = {
	...EMPTY_FILTERS,
	clientStatuses: ["active"],
	appointments: ["past", "soon"],
};

function appointmentFilterChanged(selected: string[]): boolean {
	const defaults = DEFAULT_FILTERS.appointments;
	return (
		selected.length !== defaults.length ||
		!defaults.every((value) => selected.includes(value))
	);
}

interface ClientGroup {
	clientId: number;
	clientHash: string;
	clientName: string;
	clientActive: boolean;
	rows: QuestionnaireRow[];
	done: number;
	statusCounts: [string, number][];
	oldestSent: string | null;
	maxReminded: number;
}

/** What the client texted back, shown under a Responded status. */
function ResponseText({ row }: { row: QuestionnaireRow }) {
	if (!row.responseText) return null;
	return (
		<span className="line-clamp-2 block max-w-xs text-xs font-normal text-muted-foreground">
			<Redact>{row.responseText}</Redact>
		</span>
	);
}

/** PDF status plus a link to the client's Drive folder. */
function PdfCell({
	row,
	onCheck,
	checking,
}: {
	row: QuestionnaireRow;
	onCheck: () => void;
	/** This row is the one being checked, so its icon spins. */
	checking: boolean;
}) {
	return (
		<span className="flex items-center gap-2">
			<PdfStatus pdfCheckedAt={row.pdfCheckedAt} pdfFileId={row.pdfFileId} />
			{row.status === "COMPLETED" && !row.pdfFileId && (
				<Button
					aria-label="Check Drive for this PDF now"
					className="text-muted-foreground hover:text-primary"
					onClick={onCheck}
					size="icon-xs"
					title="Check Drive for this PDF now"
					type="button"
					variant="ghost"
				>
					<RefreshCw className={cn("h-3 w-3", checking && "animate-spin")} />
				</Button>
			)}
			{row.clientDriveId && (
				<a
					className="text-primary hover:underline"
					href={`https://drive.google.com/drive/folders/${row.clientDriveId}`}
					rel="noreferrer"
					target="_blank"
				>
					Folder
				</a>
			)}
		</span>
	);
}

/** PDFs found out of the completed questionnaires, with a refresh icon while any are missing. */
function GroupPdfSummary({
	group,
	onCheck,
	checking,
}: {
	group: ClientGroup;
	onCheck: () => void;
	checking: boolean;
}) {
	const completed = group.rows.filter((r) => r.status === "COMPLETED");
	if (completed.length === 0)
		return <span className="text-muted-foreground">—</span>;
	const found = completed.filter((r) => r.pdfFileId).length;
	return (
		<span
			className={cn(
				"flex items-center gap-2",
				found === completed.length ? "text-success" : "text-warning",
			)}
		>
			{found} of {completed.length} found
			{found < completed.length && (
				<Button
					aria-label={`Check Drive for ${group.clientName}'s PDFs now`}
					className="text-muted-foreground hover:text-primary"
					onClick={(e) => {
						e.stopPropagation();
						onCheck();
					}}
					size="icon-xs"
					title="Check Drive for PDFs now"
					type="button"
					variant="ghost"
				>
					<RefreshCw className={cn("h-3 w-3", checking && "animate-spin")} />
				</Button>
			)}
		</span>
	);
}

function rowStatus(row: QuestionnaireRow): string {
	return row.status ?? UNSET_STATUS;
}

function remindedBucket(row: QuestionnaireRow): string {
	const count = row.reminded ?? 0;
	return count >= 3 ? "3+" : String(count);
}

function pdfState(row: QuestionnaireRow): PdfState {
	if (row.pdfFileId) return "found";
	return row.pdfCheckedAt ? "missing" : "unchecked";
}

function appointmentState(row: QuestionnaireRow): AppointmentState {
	if (!row.appointment) return "none";
	if (row.appointmentIsPast) return "past";
	return row.appointment < laterAppointmentCutoff() ? "soon" : "later";
}

// Each filter is skipped when `except` names it, so a facet's own counts
// reflect every other active filter but not its own selection.
function matchesFilters(
	row: QuestionnaireRow,
	filters: Filters,
	except?: keyof Filters,
): boolean {
	if (
		except !== "search" &&
		!fuzzyNameRowMatches(nameSearchWords(filters.search.trim()), row.clientName)
	) {
		return false;
	}

	if (except !== "statuses") {
		const status = rowStatus(row);
		if (filters.statuses.length > 0 && !filters.statuses.includes(status)) {
			return false;
		}
	}

	if (
		except !== "types" &&
		filters.types.length > 0 &&
		!filters.types.includes(row.questionnaireType)
	) {
		return false;
	}

	if (
		except !== "clientStatuses" &&
		filters.clientStatuses.length > 0 &&
		!filters.clientStatuses.includes(clientStatusValue(row))
	) {
		return false;
	}

	if (
		except !== "reminded" &&
		filters.reminded.length > 0 &&
		!filters.reminded.includes(remindedBucket(row))
	) {
		return false;
	}

	if (
		except !== "pdfs" &&
		filters.pdfs.length > 0 &&
		!filters.pdfs.includes(pdfState(row))
	) {
		return false;
	}

	if (
		except !== "appointments" &&
		filters.appointments.length > 0 &&
		!filters.appointments.includes(appointmentState(row))
	) {
		return false;
	}

	return true;
}

function compareRows(
	a: QuestionnaireRow,
	b: QuestionnaireRow,
	sort: RowSortKey,
): number {
	switch (sort) {
		case "client":
			return a.clientName.localeCompare(b.clientName);
		case "type":
			return a.questionnaireType.localeCompare(b.questionnaireType);
		case "status":
			return statusLabel(rowStatus(a)).localeCompare(statusLabel(rowStatus(b)));
		case "sent":
			return compareDateOnly(a.sent, b.sent);
		case "reminded":
			return (a.reminded ?? 0) - (b.reminded ?? 0);
		case "appointment":
			// Clients with no appointment at all sort last when ascending.
			return (
				(a.appointment?.getTime() ?? Number.POSITIVE_INFINITY) -
				(b.appointment?.getTime() ?? Number.POSITIVE_INFINITY)
			);
		case "pdf":
			return PDF_RANK[pdfState(a)] - PDF_RANK[pdfState(b)];
		case "lastReminded":
			return compareDateOnly(a.lastReminded, b.lastReminded);
	}
}

function groupByClient(rows: QuestionnaireRow[]): ClientGroup[] {
	const groups = new Map<number, ClientGroup>();

	for (const row of rows) {
		let group = groups.get(row.clientId);
		if (!group) {
			group = {
				clientId: row.clientId,
				clientHash: row.clientHash,
				clientName: row.clientName,
				clientActive: row.clientActive,
				rows: [],
				done: 0,
				statusCounts: [],
				oldestSent: null,
				maxReminded: 0,
			};
			groups.set(row.clientId, group);
		}
		group.rows.push(row);
		if (DONE_STATUSES.includes(rowStatus(row))) group.done += 1;
		if (row.sent && (!group.oldestSent || row.sent < group.oldestSent)) {
			group.oldestSent = row.sent;
		}
		group.maxReminded = Math.max(group.maxReminded, row.reminded ?? 0);
	}

	for (const group of groups.values()) {
		group.statusCounts = Object.entries(countBy(group.rows, rowStatus));
	}

	return [...groups.values()];
}

function compareGroups(
	a: ClientGroup,
	b: ClientGroup,
	sort: GroupSortKey,
): number {
	switch (sort) {
		case "client":
			return a.clientName.localeCompare(b.clientName);
		case "progress":
			// Ascending puts the clients with the fewest questionnaires left first.
			return a.rows.length - a.done - (b.rows.length - b.done);
		case "oldestSent":
			return compareDateOnly(a.oldestSent, b.oldestSent);
		case "maxReminded":
			return a.maxReminded - b.maxReminded;
	}
}

function StatusSummary({ counts }: { counts: [string, number][] }) {
	return (
		<span className="flex flex-wrap gap-x-3 gap-y-0.5">
			{counts.map(([status, count]) => (
				<span
					className={getStatusColorClass(status as StatusValue)}
					key={status}
				>
					{count} {statusLabel(status)}
				</span>
			))}
		</span>
	);
}

export function QuestionnaireDataView() {
	const { data, isLoading, isError, refetch } =
		api.questionnaires.listAll.useQuery();
	const utils = api.useUtils();
	const checkPdfs = api.questionnaires.checkPdfs.useMutation({
		onSuccess: ({ found, missing }) => {
			toast.success(`PDF check done: ${found} found, ${missing} still missing`);
			void utils.questionnaires.listAll.invalidate();
		},
		onError: (error) => toast.error(error.message),
	});

	// Checks queue on the server and run one at a time, so several can be pending.
	// Keys are "q<questionnaireId>" or "c<clientId>".
	const [pendingChecks, setPendingChecks] = useState<Set<string>>(new Set());
	const runCheck = async (input: {
		clientId?: number;
		questionnaireId?: number;
	}) => {
		const key = input.questionnaireId
			? `q${input.questionnaireId}`
			: `c${input.clientId}`;
		setPendingChecks((prev) => new Set(prev).add(key));
		try {
			await checkPdfs.mutateAsync(input);
		} catch {
			// The mutation's onError already shows the message.
		} finally {
			setPendingChecks((prev) => {
				const next = new Set(prev);
				next.delete(key);
				return next;
			});
		}
	};

	const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
	const [viewMode, setViewMode] = useState<ViewMode>("rows");
	const [rowSort, setRowSort] = useState<RowSortKey>("appointment");
	const [rowSortDir, setRowSortDir] = useState<SortDir>("asc");
	const [groupSort, setGroupSort] = useState<GroupSortKey>("progress");
	const [groupSortDir, setGroupSortDir] = useState<SortDir>("desc");
	const [expanded, setExpanded] = useState<Set<number>>(new Set());

	useSavedView(
		"questionnaires",
		{ filters, viewMode, rowSort, rowSortDir, groupSort, groupSortDir },
		(saved) => {
			if (saved.filters) setFilters({ ...DEFAULT_FILTERS, ...saved.filters });
			if (saved.viewMode) setViewMode(saved.viewMode);
			if (saved.rowSort) setRowSort(saved.rowSort);
			if (saved.rowSortDir) setRowSortDir(saved.rowSortDir);
			if (saved.groupSort) setGroupSort(saved.groupSort);
			if (saved.groupSortDir) setGroupSortDir(saved.groupSortDir);
		},
	);

	const rows = useMemo(() => data ?? [], [data]);

	// The list and counts follow the deferred filters, so typing in the search
	// box stays responsive while the table catches up.
	const deferredFilters = useDeferredValue(filters);

	const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
		setFilters((prev) => ({ ...prev, [key]: value }));
	};

	const handleRowSort = (key: RowSortKey) => {
		if (key === rowSort) {
			setRowSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
			return;
		}
		setRowSort(key);
		setRowSortDir(key === "sent" || key === "lastReminded" ? "desc" : "asc");
	};

	const handleGroupSort = (key: GroupSortKey) => {
		if (key === groupSort) {
			setGroupSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
			return;
		}
		setGroupSort(key);
		setGroupSortDir(key === "client" ? "asc" : "desc");
	};

	const toggleExpanded = (clientId: number) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(clientId)) next.delete(clientId);
			else next.add(clientId);
			return next;
		});
	};

	const hasActiveFilters =
		filters.search !== "" ||
		filters.statuses.length > 0 ||
		filters.types.length > 0 ||
		clientStatusFilterChanged(filters.clientStatuses) ||
		filters.reminded.length > 0 ||
		filters.pdfs.length > 0 ||
		appointmentFilterChanged(filters.appointments);

	const filteredRows = useMemo(
		() => rows.filter((row) => matchesFilters(row, deferredFilters)),
		[rows, deferredFilters],
	);

	const visibleRows = useMemo(() => {
		const dir = rowSortDir === "asc" ? 1 : -1;
		return [...filteredRows].sort((a, b) => compareRows(a, b, rowSort) * dir);
	}, [filteredRows, rowSort, rowSortDir]);

	const visibleGroups = useMemo(() => {
		const dir = groupSortDir === "asc" ? 1 : -1;
		return groupByClient(filteredRows).sort(
			(a, b) => compareGroups(a, b, groupSort) * dir,
		);
	}, [filteredRows, groupSort, groupSortDir]);

	// Only the rows in view are mounted; the rest are spacer rows.
	const { scrollRef, items, measureElement, paddingTop, paddingBottom } =
		useVirtualRows(
			viewMode === "rows" ? visibleRows.length : visibleGroups.length,
			49,
		);

	// Facet counts ignore the facet's own selection so the other options in
	// its dropdown still show how many rows they would add.
	const statusCounts = useMemo(
		() =>
			countBy(
				rows.filter((row) => matchesFilters(row, deferredFilters, "statuses")),
				rowStatus,
			),
		[rows, deferredFilters],
	);
	const typeCounts = useMemo(
		() =>
			countBy(
				rows.filter((row) => matchesFilters(row, deferredFilters, "types")),
				(row) => row.questionnaireType,
			),
		[rows, deferredFilters],
	);
	const clientStatusCounts = useMemo(
		() =>
			countBy(
				rows.filter((row) =>
					matchesFilters(row, deferredFilters, "clientStatuses"),
				),
				clientStatusValue,
			),
		[rows, deferredFilters],
	);
	const remindedCounts = useMemo(
		() =>
			countBy(
				rows.filter((row) => matchesFilters(row, deferredFilters, "reminded")),
				remindedBucket,
			),
		[rows, deferredFilters],
	);
	const pdfCounts = useMemo(
		() =>
			countBy(
				rows.filter((row) => matchesFilters(row, deferredFilters, "pdfs")),
				pdfState,
			),
		[rows, deferredFilters],
	);
	const appointmentCounts = useMemo(
		() =>
			countBy(
				rows.filter((row) =>
					matchesFilters(row, deferredFilters, "appointments"),
				),
				appointmentState,
			),
		[rows, deferredFilters],
	);

	const statusOptions = useMemo(
		() =>
			QUESTIONNAIRE_STATUSES.filter((status) => status !== "ARCHIVED").map(
				(status) => ({
					value: status,
					label: statusLabel(status),
				}),
			),
		[],
	);
	const typeOptions = useMemo(
		() =>
			toFilterOptions(
				[...new Set(rows.map((row) => row.questionnaireType))].sort(),
			),
		[rows],
	);

	const clientCount = useMemo(
		() => new Set(filteredRows.map((row) => row.clientId)).size,
		[filteredRows],
	);

	const statusFilter = (
		<ColumnFilter
			columnName="Status"
			counts={statusCounts}
			onFilterChange={(values) => setFilter("statuses", values)}
			options={statusOptions}
			selectedValues={filters.statuses}
		/>
	);
	const clientFilter = (
		<ColumnFilter
			columnName="Client Status"
			counts={clientStatusCounts}
			defaultValues={DEFAULT_FILTERS.clientStatuses}
			onFilterChange={(values) => setFilter("clientStatuses", values)}
			options={CLIENT_STATUS_OPTIONS}
			selectedValues={filters.clientStatuses}
		/>
	);
	const typeFilter = (
		<ColumnFilter
			columnName="Questionnaire"
			counts={typeCounts}
			onFilterChange={(values) => setFilter("types", values)}
			options={typeOptions}
			selectedValues={filters.types}
		/>
	);
	const remindedFilter = (
		<ColumnFilter
			columnName="Reminders"
			counts={remindedCounts}
			onFilterChange={(values) => setFilter("reminded", values)}
			options={REMINDED_OPTIONS}
			selectedValues={filters.reminded}
		/>
	);
	const pdfFilter = (
		<ColumnFilter
			columnName="PDF"
			counts={pdfCounts}
			onFilterChange={(values) => setFilter("pdfs", values)}
			options={PDF_OPTIONS}
			selectedValues={filters.pdfs}
		/>
	);
	const appointmentFilter = (
		<ColumnFilter
			columnName="Appointment"
			counts={appointmentCounts}
			onFilterChange={(values) => setFilter("appointments", values)}
			options={APPOINTMENT_OPTIONS}
			selectedValues={filters.appointments}
		/>
	);

	if (isError) {
		return (
			<ErrorState
				message="Could not load questionnaires."
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

	const emptyState = (
		<TableRow>
			<TableCell colSpan={6}>
				<EmptyState
					description={hasActiveFilters ? "Try removing a filter." : undefined}
					icon={ClipboardList}
					title="No questionnaires found"
				/>
			</TableCell>
		</TableRow>
	);

	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				<Input
					className="w-64"
					onChange={(e) => setFilter("search", e.target.value)}
					placeholder="Search clients..."
					value={filters.search}
				/>
				<ToggleGroup
					onValueChange={(value) => {
						if (value) setViewMode(value as ViewMode);
					}}
					type="single"
					value={viewMode}
					variant="outline"
				>
					<ToggleGroupItem value="rows">List</ToggleGroupItem>
					<ToggleGroupItem value="clients">By client</ToggleGroupItem>
				</ToggleGroup>
				{hasActiveFilters && (
					<Button
						onClick={() => setFilters(DEFAULT_FILTERS)}
						size="sm"
						variant="ghost"
					>
						<X className="h-4 w-4" />
						Clear filters
					</Button>
				)}
				<p className="ml-auto text-sm text-muted-foreground">
					{filteredRows.length} questionnaires across {clientCount} clients
				</p>
			</div>

			<div className="rounded-lg border">
				{viewMode === "rows" ? (
					<Table
						className={FIXED_TABLE}
						classNameWrapper={VIRTUAL_TABLE_HEIGHT}
						ref={scrollRef}
					>
						<FixedCols widths={[18, 14, 14, 8, 8, 10, 16, 12]} />
						<TableHeader className={VIRTUAL_TABLE_HEADER}>
							<TableRow>
								<SortableHead
									filter={clientFilter}
									label="Client"
									onSort={handleRowSort}
									sort={rowSort}
									sortDir={rowSortDir}
									sortKey="client"
								/>
								<SortableHead
									filter={typeFilter}
									label="Questionnaire"
									onSort={handleRowSort}
									sort={rowSort}
									sortDir={rowSortDir}
									sortKey="type"
								/>
								<SortableHead
									filter={statusFilter}
									label="Status"
									onSort={handleRowSort}
									sort={rowSort}
									sortDir={rowSortDir}
									sortKey="status"
								/>
								<SortableHead
									label="Sent"
									onSort={handleRowSort}
									sort={rowSort}
									sortDir={rowSortDir}
									sortKey="sent"
								/>
								<SortableHead
									filter={remindedFilter}
									label="Reminders"
									onSort={handleRowSort}
									sort={rowSort}
									sortDir={rowSortDir}
									sortKey="reminded"
								/>
								<SortableHead
									label="Last Reminded"
									onSort={handleRowSort}
									sort={rowSort}
									sortDir={rowSortDir}
									sortKey="lastReminded"
								/>
								<SortableHead
									filter={pdfFilter}
									label="PDF"
									onSort={handleRowSort}
									sort={rowSort}
									sortDir={rowSortDir}
									sortKey="pdf"
								/>
								<SortableHead
									filter={appointmentFilter}
									label="Appointment"
									onSort={handleRowSort}
									sort={rowSort}
									sortDir={rowSortDir}
									sortKey="appointment"
								/>
							</TableRow>
						</TableHeader>
						<TableBody>
							{visibleRows.length === 0 ? (
								emptyState
							) : (
								<>
									<SpacerRow colSpan={8} height={paddingTop} />
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
													<ClientLink
														active={row.clientActive}
														hash={row.clientHash}
														name={row.clientName}
													/>
												</TableCell>
												<TableCell>{row.questionnaireType}</TableCell>
												<TableCell className={getStatusColorClass(row.status)}>
													{statusLabel(rowStatus(row))}
													<ResponseText row={row} />
												</TableCell>
												<TableCell className="text-muted-foreground">
													{formatShortDate(row.sent, "—")}
												</TableCell>
												<TableCell
													className={getReminderColorClass(row.reminded)}
												>
													{row.reminded ?? 0}
												</TableCell>
												<TableCell className="text-muted-foreground">
													{formatShortDate(row.lastReminded, "—")}
												</TableCell>
												<TableCell>
													<PdfCell
														checking={
															pendingChecks.has(`q${row.id}`) ||
															pendingChecks.has(`c${row.clientId}`)
														}
														onCheck={() =>
															runCheck({ questionnaireId: row.id })
														}
														row={row}
													/>
												</TableCell>
												<TableCell className="text-muted-foreground">
													{row.appointment ? (
														<>
															{" "}
															{formatShortInstantDate(row.appointment)}{" "}
															{row.appointmentIsPast && " (past)"}{" "}
														</>
													) : (
														"—"
													)}
												</TableCell>
											</TableRow>
										);
									})}
									<SpacerRow colSpan={8} height={paddingBottom} />
								</>
							)}
						</TableBody>
					</Table>
				) : (
					<Table
						className={FIXED_TABLE}
						classNameWrapper={VIRTUAL_TABLE_HEIGHT}
						ref={scrollRef}
					>
						<FixedCols widths={[24, 14, 16, 22, 12, 12]} />
						<TableHeader className={VIRTUAL_TABLE_HEADER}>
							<TableRow>
								<SortableHead
									filter={clientFilter}
									label="Client"
									onSort={handleGroupSort}
									sort={groupSort}
									sortDir={groupSortDir}
									sortKey="client"
								/>
								<SortableHead
									label="Progress"
									onSort={handleGroupSort}
									sort={groupSort}
									sortDir={groupSortDir}
									sortKey="progress"
								/>
								<TableHead>PDFs</TableHead>
								<TableHead>
									<div className="flex items-center gap-1">
										Statuses
										{statusFilter}
									</div>
								</TableHead>
								<SortableHead
									label="Oldest Sent"
									onSort={handleGroupSort}
									sort={groupSort}
									sortDir={groupSortDir}
									sortKey="oldestSent"
								/>
								<SortableHead
									filter={remindedFilter}
									label="Most Reminders"
									onSort={handleGroupSort}
									sort={groupSort}
									sortDir={groupSortDir}
									sortKey="maxReminded"
								/>
							</TableRow>
						</TableHeader>
						{visibleGroups.length === 0 ? (
							<TableBody>{emptyState}</TableBody>
						) : (
							<>
								<tbody>
									<SpacerRow colSpan={6} height={paddingTop} />
								</tbody>
								{items.map((item) => {
									const group = visibleGroups[item.index];
									if (!group) return null;
									const isOpen = expanded.has(group.clientId);
									const Chevron = isOpen ? ChevronDown : ChevronRight;
									return (
										<tbody
											data-index={item.index}
											key={group.clientId}
											ref={measureElement}
										>
											<TableRow
												className="cursor-pointer"
												onClick={() => toggleExpanded(group.clientId)}
											>
												<TableCell>
													<div className="flex items-center gap-1">
														<Button
															aria-expanded={isOpen}
															aria-label={`${isOpen ? "Collapse" : "Expand"} ${group.clientName}`}
															className="text-muted-foreground hover:text-foreground"
															onClick={(e) => {
																e.stopPropagation();
																toggleExpanded(group.clientId);
															}}
															size="icon-xs"
															type="button"
															variant="ghost"
														>
															<Chevron className="h-4 w-4 shrink-0" />
														</Button>
														{/* Clicking the client link opens the client, not the row. */}
														{/* biome-ignore lint/a11y/noStaticElementInteractions: only stops the click reaching the row */}
														{/* biome-ignore lint/a11y/useKeyWithClickEvents: only stops the click reaching the row */}
														<span onClick={(e) => e.stopPropagation()}>
															<ClientLink
																active={group.clientActive}
																hash={group.clientHash}
																name={group.clientName}
															/>
														</span>
													</div>
												</TableCell>
												<TableCell
													className={
														group.done === group.rows.length
															? "text-success"
															: undefined
													}
												>
													{group.done} of {group.rows.length} done
												</TableCell>
												<TableCell>
													<GroupPdfSummary
														checking={pendingChecks.has(`c${group.clientId}`)}
														group={group}
														onCheck={() =>
															runCheck({ clientId: group.clientId })
														}
													/>
												</TableCell>
												<TableCell>
													<StatusSummary counts={group.statusCounts} />
												</TableCell>
												<TableCell className="text-muted-foreground">
													{formatShortDate(group.oldestSent, "—")}
												</TableCell>
												<TableCell
													className={getReminderColorClass(group.maxReminded)}
												>
													{group.maxReminded}
												</TableCell>
											</TableRow>
											{isOpen && (
												<TableRow className="bg-muted/40 hover:bg-muted/40">
													<TableCell className="pl-9" colSpan={6}>
														<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem_5rem_6rem_minmax(10rem,auto)] gap-x-4 gap-y-1 text-sm">
															<span className="text-xs text-muted-foreground">
																Questionnaire
															</span>
															<span className="text-xs text-muted-foreground">
																Status
															</span>
															<span className="text-xs text-muted-foreground">
																Sent
															</span>
															<span className="text-xs text-muted-foreground">
																Reminders
															</span>
															<span className="text-xs text-muted-foreground">
																Last Reminded
															</span>
															<span className="text-xs text-muted-foreground">
																PDF
															</span>
															{group.rows.map((row) => (
																<Fragment key={row.id}>
																	<span>{row.questionnaireType}</span>
																	<span
																		className={getStatusColorClass(row.status)}
																	>
																		{statusLabel(rowStatus(row))}
																		<ResponseText row={row} />
																	</span>
																	<span className="text-muted-foreground">
																		{formatShortDate(row.sent, "—")}
																	</span>
																	<span
																		className={getReminderColorClass(
																			row.reminded,
																		)}
																	>
																		{row.reminded ?? 0}
																	</span>
																	<span className="text-muted-foreground">
																		{formatShortDate(row.lastReminded, "—")}
																	</span>
																	<PdfCell
																		checking={
																			pendingChecks.has(`q${row.id}`) ||
																			pendingChecks.has(`c${row.clientId}`)
																		}
																		onCheck={() =>
																			runCheck({
																				questionnaireId: row.id,
																			})
																		}
																		row={row}
																	/>
																</Fragment>
															))}
														</div>
													</TableCell>
												</TableRow>
											)}
										</tbody>
									);
								})}
								<tbody>
									<SpacerRow colSpan={6} height={paddingBottom} />
								</tbody>
							</>
						)}
					</Table>
				)}
			</div>
		</>
	);
}

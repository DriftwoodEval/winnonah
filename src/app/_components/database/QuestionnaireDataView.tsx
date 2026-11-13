"use client";

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
import { ChevronDown, ChevronRight, ClipboardList, X } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { QUESTIONNAIRE_STATUSES } from "~/lib/constants";
import { statusLabel } from "~/lib/questionnaires/questionnaire-history";
import {
	cn,
	compareDateOnly,
	formatShortDate,
	getReminderColorClass,
	getStatusColorClass,
} from "~/lib/utils";
import type { AppRouter } from "~/server/api/root";
import { api } from "~/trpc/react";
import {
	CLIENT_STATUS_OPTIONS,
	ClientLink,
	clientStatusValue,
	countBy,
	SortableHead,
	type SortDir,
	toggleValue,
} from "./shared";

type QuestionnaireRow =
	inferRouterOutputs<AppRouter>["questionnaires"]["listAll"][number];
type StatusValue = (typeof QUESTIONNAIRE_STATUSES)[number];

// Status shown when a row's status is null in the database.
const UNSET_STATUS = "PENDING";

// Rows with these statuses are hidden unless the status filter asks for them.
const HIDDEN_BY_DEFAULT: StatusValue[] = ["ARCHIVED"];

// A questionnaire in one of these statuses counts toward a client's progress.
const DONE_STATUSES: string[] = ["COMPLETED", "EXTERNAL"];

const REMINDED_OPTIONS: FilterOption[] = [
	{ value: "0", label: "Never" },
	{ value: "1", label: "1" },
	{ value: "2", label: "2" },
	{ value: "3+", label: "3 or more" },
];

type RowSortKey =
	| "client"
	| "type"
	| "status"
	| "sent"
	| "reminded"
	| "lastReminded";

type GroupSortKey = "client" | "progress" | "oldestSent" | "maxReminded";

type ViewMode = "rows" | "clients";

interface Filters {
	search: string;
	statuses: string[];
	types: string[];
	clientStatuses: string[];
	reminded: string[];
}

const EMPTY_FILTERS: Filters = {
	search: "",
	statuses: [],
	types: [],
	clientStatuses: [],
	reminded: [],
};

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

function rowStatus(row: QuestionnaireRow): string {
	return row.status ?? UNSET_STATUS;
}

function remindedBucket(row: QuestionnaireRow): string {
	const count = row.reminded ?? 0;
	return count >= 3 ? "3+" : String(count);
}

// Each filter is skipped when `except` names it, so a facet's own counts
// reflect every other active filter but not its own selection.
function matchesFilters(
	row: QuestionnaireRow,
	filters: Filters,
	except?: keyof Filters,
): boolean {
	const search = filters.search.trim().toLowerCase();
	if (except !== "search" && search) {
		const haystack = `${row.clientName} ${row.questionnaireType}`.toLowerCase();
		if (!haystack.includes(search)) return false;
	}

	if (except !== "statuses") {
		const status = rowStatus(row);
		if (filters.statuses.length > 0) {
			if (!filters.statuses.includes(status)) return false;
		} else if (HIDDEN_BY_DEFAULT.includes(status as StatusValue)) {
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

	const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
	const [viewMode, setViewMode] = useState<ViewMode>("rows");
	const [rowSort, setRowSort] = useState<RowSortKey>("sent");
	const [rowSortDir, setRowSortDir] = useState<SortDir>("desc");
	const [groupSort, setGroupSort] = useState<GroupSortKey>("progress");
	const [groupSortDir, setGroupSortDir] = useState<SortDir>("desc");
	const [expanded, setExpanded] = useState<Set<number>>(new Set());

	const rows = useMemo(() => data ?? [], [data]);

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
		filters.clientStatuses.length > 0 ||
		filters.reminded.length > 0;

	const filteredRows = useMemo(
		() => rows.filter((row) => matchesFilters(row, filters)),
		[rows, filters],
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

	// Facet counts ignore the facet's own selection so the other options in
	// its dropdown still show how many rows they would add.
	const statusCounts = useMemo(
		() =>
			countBy(
				rows.filter((row) => matchesFilters(row, filters, "statuses")),
				rowStatus,
			),
		[rows, filters],
	);
	const typeCounts = useMemo(
		() =>
			countBy(
				rows.filter((row) => matchesFilters(row, filters, "types")),
				(row) => row.questionnaireType,
			),
		[rows, filters],
	);
	const clientStatusCounts = useMemo(
		() =>
			countBy(
				rows.filter((row) => matchesFilters(row, filters, "clientStatuses")),
				clientStatusValue,
			),
		[rows, filters],
	);
	const remindedCounts = useMemo(
		() =>
			countBy(
				rows.filter((row) => matchesFilters(row, filters, "reminded")),
				remindedBucket,
			),
		[rows, filters],
	);

	const statusOptions = useMemo(
		() =>
			QUESTIONNAIRE_STATUSES.map((status) => ({
				value: status,
				label: statusLabel(status),
			})),
		[],
	);
	const typeOptions = useMemo(
		() =>
			toFilterOptions(
				[...new Set(rows.map((row) => row.questionnaireType))].sort(),
			),
		[rows],
	);
	const typeBreakdown = useMemo(
		() => Object.entries(typeCounts).sort(([, a], [, b]) => b - a),
		[typeCounts],
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
					placeholder="Search client or questionnaire..."
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
						onClick={() => setFilters(EMPTY_FILTERS)}
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

			{typeBreakdown.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{typeBreakdown.map(([type, count]) => (
						<button
							className={cn(
								"rounded-full border px-2.5 py-0.5 text-xs transition-colors hover:border-primary",
								filters.types.includes(type) &&
									"border-primary bg-primary/10 text-primary",
							)}
							key={type}
							onClick={() =>
								setFilter("types", toggleValue(filters.types, type))
							}
							type="button"
						>
							{type}: {count}
						</button>
					))}
				</div>
			)}

			<div className="rounded-lg border">
				{viewMode === "rows" ? (
					<Table>
						<TableHeader>
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
							</TableRow>
						</TableHeader>
						<TableBody>
							{visibleRows.length === 0
								? emptyState
								: visibleRows.map((row) => (
										<TableRow key={row.id}>
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
										</TableRow>
									))}
						</TableBody>
					</Table>
				) : (
					<Table>
						<TableHeader>
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
						<TableBody>
							{visibleGroups.length === 0
								? emptyState
								: visibleGroups.map((group) => {
										const isOpen = expanded.has(group.clientId);
										const Chevron = isOpen ? ChevronDown : ChevronRight;
										return (
											<Fragment key={group.clientId}>
												<TableRow>
													<TableCell>
														<div className="flex items-center gap-1">
															<button
																aria-expanded={isOpen}
																aria-label={`${isOpen ? "Collapse" : "Expand"} ${group.clientName}`}
																className="text-muted-foreground hover:text-foreground"
																onClick={() => toggleExpanded(group.clientId)}
																type="button"
															>
																<Chevron className="h-4 w-4 shrink-0" />
															</button>
															<ClientLink
																active={group.clientActive}
																hash={group.clientHash}
																name={group.clientName}
															/>
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
														<TableCell className="pl-9" colSpan={5}>
															<div className="grid grid-cols-[1fr_1fr_6rem_5rem_6rem] gap-x-4 gap-y-1 text-sm">
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
																{group.rows.map((row) => (
																	<Fragment key={row.id}>
																		<span>{row.questionnaireType}</span>
																		<span
																			className={getStatusColorClass(
																				row.status,
																			)}
																		>
																			{statusLabel(rowStatus(row))}
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
																	</Fragment>
																))}
															</div>
														</TableCell>
													</TableRow>
												)}
											</Fragment>
										);
									})}
						</TableBody>
					</Table>
				)}
			</div>
		</>
	);
}

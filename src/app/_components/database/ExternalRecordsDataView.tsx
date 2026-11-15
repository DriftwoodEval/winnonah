"use client";

import {
	ColumnFilter,
	type FilterOption,
} from "@components/shared/ColumnFilter";
import { EmptyState } from "@components/shared/EmptyState";
import { ErrorState } from "@components/shared/ErrorState";
import type { inferRouterOutputs } from "@trpc/server";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Skeleton } from "@ui/skeleton";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@ui/table";
import { FolderOpen, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import {
	fuzzyNameRowMatches,
	nameSearchWords,
} from "~/lib/clients/name-search";
import {
	RECORDS_STATUSES,
	type RecordsStatus,
} from "~/lib/records/records-status";
import {
	compareDateOnly,
	formatShortDate,
	formatShortInstantDate,
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

type RecordsRow =
	inferRouterOutputs<AppRouter>["externalRecords"]["listAll"][number];

const STATUS_COLOR_CLASSES: Record<RecordsStatus, string> = {
	"Not requested": "text-error",
	Queued: "",
	"On hold": "",
	Requested: "",
	"Requested again": "text-warning",
	Reviewed: "text-success",
	"Not needed": "text-muted-foreground",
};

const STATUS_OPTIONS: FilterOption[] = RECORDS_STATUSES.map((status) => ({
	value: status,
	label: status,
}));

type SortKey =
	| "client"
	| "status"
	| "lastRequested"
	| "requests"
	| "holdUntil"
	| "notesUpdated";

interface Filters {
	search: string;
	statuses: string[];
	clientStatuses: string[];
}

const EMPTY_FILTERS: Filters = {
	search: "",
	statuses: [],
	clientStatuses: [],
};

// Active clients, and every records status except Not needed, until the viewer
// changes those filters.
const DEFAULT_STATUSES = RECORDS_STATUSES.filter((s) => s !== "Not needed");
const DEFAULT_FILTERS: Filters = {
	...EMPTY_FILTERS,
	statuses: DEFAULT_STATUSES,
	clientStatuses: ["active"],
};

// Each filter is skipped when `except` names it, so a facet's own counts
// reflect every other active filter but not its own selection.
function matchesFilters(
	row: RecordsRow,
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
		if (filters.statuses.length > 0 && !filters.statuses.includes(row.status)) {
			return false;
		}
	}

	if (
		except !== "clientStatuses" &&
		filters.clientStatuses.length > 0 &&
		!filters.clientStatuses.includes(clientStatusValue(row))
	) {
		return false;
	}

	return true;
}

function compareRows(a: RecordsRow, b: RecordsRow, sort: SortKey): number {
	switch (sort) {
		case "client":
			return a.clientName.localeCompare(b.clientName);
		case "status":
			return (
				RECORDS_STATUSES.indexOf(a.status) - RECORDS_STATUSES.indexOf(b.status)
			);
		case "lastRequested":
			return compareDateOnly(a.latestRequestedDate, b.latestRequestedDate);
		case "requests":
			return a.requestCount - b.requestCount;
		case "holdUntil":
			return compareDateOnly(a.holdUntil, b.holdUntil);
		case "notesUpdated":
			return (
				(a.notesUpdatedAt?.getTime() ?? 0) - (b.notesUpdatedAt?.getTime() ?? 0)
			);
	}
}

export function ExternalRecordsDataView() {
	const { data, isLoading, isError, refetch } =
		api.externalRecords.listAll.useQuery();

	const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
	const [sort, setSort] = useState<SortKey>("status");
	const [sortDir, setSortDir] = useState<SortDir>("asc");

	useSavedView("externalRecords", { filters, sort, sortDir }, (saved) => {
		if (saved.filters) setFilters({ ...DEFAULT_FILTERS, ...saved.filters });
		if (saved.sort) setSort(saved.sort);
		if (saved.sortDir) setSortDir(saved.sortDir);
	});

	const rows = useMemo(() => data ?? [], [data]);

	// The list and counts follow the deferred filters, so typing in the search
	// box stays responsive while the table catches up.
	const deferredFilters = useDeferredValue(filters);

	const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
		setFilters((prev) => ({ ...prev, [key]: value }));
	};

	const handleSort = (key: SortKey) => {
		if (key === sort) {
			setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
			return;
		}
		setSort(key);
		const startsNewestFirst =
			key === "lastRequested" || key === "notesUpdated" || key === "requests";
		setSortDir(startsNewestFirst ? "desc" : "asc");
	};

	const hasActiveFilters =
		filters.search !== "" ||
		filters.statuses.length !== DEFAULT_STATUSES.length ||
		!DEFAULT_STATUSES.every((s) => filters.statuses.includes(s)) ||
		clientStatusFilterChanged(filters.clientStatuses);

	const visibleRows = useMemo(() => {
		const dir = sortDir === "asc" ? 1 : -1;
		return rows
			.filter((row) => matchesFilters(row, deferredFilters))
			.sort((a, b) => compareRows(a, b, sort) * dir);
	}, [rows, deferredFilters, sort, sortDir]);

	// Only the rows in view are mounted; the rest are spacer rows.
	const { scrollRef, items, measureElement, paddingTop, paddingBottom } =
		useVirtualRows(visibleRows.length, 49);

	const statusCounts = useMemo(
		() =>
			countBy(
				rows.filter((row) => matchesFilters(row, deferredFilters, "statuses")),
				(row) => row.status,
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

	if (isError) {
		return (
			<ErrorState
				message="Could not load external records."
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

	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				<Input
					className="w-64"
					onChange={(e) => setFilter("search", e.target.value)}
					placeholder="Search clients..."
					value={filters.search}
				/>
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
					{visibleRows.length} clients
				</p>
			</div>

			<div className="rounded-lg border">
				<Table
					className={FIXED_TABLE}
					classNameWrapper={VIRTUAL_TABLE_HEIGHT}
					ref={scrollRef}
				>
					<FixedCols widths={[18, 34, 14, 10, 12, 12]} />
					<TableHeader className={VIRTUAL_TABLE_HEADER}>
						<TableRow>
							<SortableHead
								{...sortProps}
								filter={
									<ColumnFilter
										columnName="Client Status"
										counts={clientStatusCounts}
										defaultValues={DEFAULT_FILTERS.clientStatuses}
										onFilterChange={(values) =>
											setFilter("clientStatuses", values)
										}
										options={CLIENT_STATUS_OPTIONS}
										selectedValues={filters.clientStatuses}
									/>
								}
								label="Client"
								sortKey="client"
							/>
							<SortableHead
								{...sortProps}
								filter={
									<ColumnFilter
										columnName="Status"
										counts={statusCounts}
										defaultValues={DEFAULT_FILTERS.statuses}
										onFilterChange={(values) => setFilter("statuses", values)}
										options={STATUS_OPTIONS}
										selectedValues={filters.statuses}
									/>
								}
								label="Status"
								sortKey="status"
							/>
							<SortableHead
								{...sortProps}
								label="Last Requested"
								sortKey="lastRequested"
							/>
							<SortableHead
								{...sortProps}
								label="Requests Sent"
								sortKey="requests"
							/>
							<SortableHead
								{...sortProps}
								label="Hold Until"
								sortKey="holdUntil"
							/>
							<SortableHead
								{...sortProps}
								label="Notes Updated"
								sortKey="notesUpdated"
							/>
						</TableRow>
					</TableHeader>
					<TableBody>
						{visibleRows.length === 0 ? (
							<TableRow>
								<TableCell colSpan={6}>
									<EmptyState
										description={
											hasActiveFilters ? "Try removing a filter." : undefined
										}
										icon={FolderOpen}
										title="No external records found"
									/>
								</TableCell>
							</TableRow>
						) : (
							<>
								<SpacerRow colSpan={6} height={paddingTop} />
								{items.map((item) => {
									const row = visibleRows[item.index];
									if (!row) return null;
									return (
										<TableRow
											data-index={item.index}
											key={row.clientId}
											ref={measureElement}
										>
											<TableCell>
												<ClientLink
													active={row.clientActive}
													hash={row.clientHash}
													name={row.clientName}
												/>
											</TableCell>
											<TableCell className={STATUS_COLOR_CLASSES[row.status]}>
												{row.status}
												{row.blockers.length > 0 && (
													<div className="mt-1 flex flex-col items-start gap-1">
														{row.blockers.map((reason) => (
															<Badge
																className="h-auto rounded-md py-1 whitespace-normal"
																key={reason}
																variant="warning"
															>
																{reason}
															</Badge>
														))}
													</div>
												)}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{formatShortDate(row.latestRequestedDate, "—")}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{row.requestCount}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{formatShortDate(row.holdUntil, "—")}
											</TableCell>
											<TableCell className="text-muted-foreground">
												{row.notesUpdatedAt
													? formatShortInstantDate(row.notesUpdatedAt)
													: "—"}
											</TableCell>
										</TableRow>
									);
								})}
								<SpacerRow colSpan={6} height={paddingBottom} />
							</>
						)}
					</TableBody>
				</Table>
			</div>
		</>
	);
}

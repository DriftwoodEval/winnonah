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
import { FolderOpen, X } from "lucide-react";
import { useMemo, useState } from "react";
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
	clientStatusValue,
	countBy,
	SortableHead,
	type SortDir,
} from "./shared";

type RecordsRow =
	inferRouterOutputs<AppRouter>["externalRecords"]["listAll"][number];

// Hidden unless the status filter asks for them.
const HIDDEN_BY_DEFAULT: RecordsStatus[] = ["Not needed"];

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

const EMPTY_FILTERS: Filters = { search: "", statuses: [], clientStatuses: [] };

// Each filter is skipped when `except` names it, so a facet's own counts
// reflect every other active filter but not its own selection.
function matchesFilters(
	row: RecordsRow,
	filters: Filters,
	except?: keyof Filters,
): boolean {
	const search = filters.search.trim().toLowerCase();
	if (
		except !== "search" &&
		search &&
		!row.clientName.toLowerCase().includes(search)
	) {
		return false;
	}

	if (except !== "statuses") {
		if (filters.statuses.length > 0) {
			if (!filters.statuses.includes(row.status)) return false;
		} else if (HIDDEN_BY_DEFAULT.includes(row.status)) {
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

	const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
	const [sort, setSort] = useState<SortKey>("status");
	const [sortDir, setSortDir] = useState<SortDir>("asc");

	const rows = useMemo(() => data ?? [], [data]);

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
		filters.statuses.length > 0 ||
		filters.clientStatuses.length > 0;

	const visibleRows = useMemo(() => {
		const dir = sortDir === "asc" ? 1 : -1;
		return rows
			.filter((row) => matchesFilters(row, filters))
			.sort((a, b) => compareRows(a, b, sort) * dir);
	}, [rows, filters, sort, sortDir]);

	const statusCounts = useMemo(
		() =>
			countBy(
				rows.filter((row) => matchesFilters(row, filters, "statuses")),
				(row) => row.status,
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
					placeholder="Search client..."
					value={filters.search}
				/>
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
					{visibleRows.length} clients
				</p>
			</div>

			<div className="rounded-lg border">
				<Table>
					<TableHeader>
						<TableRow>
							<SortableHead
								{...sortProps}
								filter={
									<ColumnFilter
										columnName="Client Status"
										counts={clientStatusCounts}
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
							visibleRows.map((row) => (
								<TableRow key={row.clientId}>
									<TableCell>
										<ClientLink
											active={row.clientActive}
											hash={row.clientHash}
											name={row.clientName}
										/>
									</TableCell>
									<TableCell className={STATUS_COLOR_CLASSES[row.status]}>
										{row.status}
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
							))
						)}
					</TableBody>
				</Table>
			</div>
		</>
	);
}

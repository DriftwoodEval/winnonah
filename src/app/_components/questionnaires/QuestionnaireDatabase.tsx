"use client";

import { ClientHoverCard } from "@components/client/ClientHoverCard";
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
import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	ClipboardList,
	X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
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

type QuestionnaireRow =
	inferRouterOutputs<AppRouter>["questionnaires"]["listAll"][number];
type StatusValue = (typeof QUESTIONNAIRE_STATUSES)[number];

// Status shown when a row's status is null in the database.
const UNSET_STATUS = "PENDING";

// Rows with these statuses are hidden unless the status filter asks for them.
const HIDDEN_BY_DEFAULT: StatusValue[] = ["ARCHIVED"];

const CLIENT_STATUS_OPTIONS: FilterOption[] = [
	{ value: "active", label: "Active" },
	{ value: "inactive", label: "Inactive" },
];

const REMINDED_OPTIONS: FilterOption[] = [
	{ value: "0", label: "Never" },
	{ value: "1", label: "1" },
	{ value: "2", label: "2" },
	{ value: "3+", label: "3 or more" },
];

type SortKey =
	| "client"
	| "type"
	| "status"
	| "sent"
	| "reminded"
	| "lastReminded";
type SortDir = "asc" | "desc";

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

function rowStatus(row: QuestionnaireRow): string {
	return row.status ?? UNSET_STATUS;
}

function remindedBucket(row: QuestionnaireRow): string {
	const count = row.reminded ?? 0;
	return count >= 3 ? "3+" : String(count);
}

function clientStatusValue(row: QuestionnaireRow): string {
	return row.clientActive ? "active" : "inactive";
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

function countBy(
	rows: QuestionnaireRow[],
	getKey: (row: QuestionnaireRow) => string,
): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const row of rows) {
		const key = getKey(row);
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

function compareRows(
	a: QuestionnaireRow,
	b: QuestionnaireRow,
	sort: SortKey,
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

function SortableHead({
	label,
	sortKey,
	sort,
	sortDir,
	onSort,
	filter,
}: {
	label: string;
	sortKey: SortKey;
	sort: SortKey;
	sortDir: SortDir;
	onSort: (key: SortKey) => void;
	filter?: React.ReactNode;
}) {
	const active = sort === sortKey;
	const SortIcon = active
		? sortDir === "asc"
			? ArrowUp
			: ArrowDown
		: ArrowUpDown;

	return (
		<TableHead>
			<div className="flex items-center gap-1">
				<button
					className={cn(
						"flex items-center gap-1 transition-colors",
						active
							? "font-semibold text-primary"
							: "text-foreground hover:text-primary",
					)}
					onClick={() => onSort(sortKey)}
					type="button"
				>
					{label}
					<SortIcon
						className={cn(
							"h-3.5 w-3.5",
							active ? "text-primary" : "text-muted-foreground/60",
						)}
					/>
				</button>
				{filter}
			</div>
		</TableHead>
	);
}

function toggleValue(values: string[], value: string): string[] {
	return values.includes(value)
		? values.filter((v) => v !== value)
		: [...values, value];
}

export function QuestionnaireDatabase() {
	const { data, isLoading, isError, refetch } =
		api.questionnaires.listAll.useQuery();

	const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
	const [sort, setSort] = useState<SortKey>("sent");
	const [sortDir, setSortDir] = useState<SortDir>("desc");

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
		setSortDir(key === "sent" || key === "lastReminded" ? "desc" : "asc");
	};

	const hasActiveFilters =
		filters.search !== "" ||
		filters.statuses.length > 0 ||
		filters.types.length > 0 ||
		filters.clientStatuses.length > 0 ||
		filters.reminded.length > 0;

	const visibleRows = useMemo(() => {
		const dir = sortDir === "asc" ? 1 : -1;
		return rows
			.filter((row) => matchesFilters(row, filters))
			.sort((a, b) => compareRows(a, b, sort) * dir);
	}, [rows, filters, sort, sortDir]);

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

	const visibleClientCount = useMemo(
		() => new Set(visibleRows.map((row) => row.clientId)).size,
		[visibleRows],
	);

	const typeBreakdown = useMemo(
		() => Object.entries(typeCounts).sort(([, a], [, b]) => b - a),
		[typeCounts],
	);

	return (
		<div className="container mx-auto flex flex-col gap-4 p-4">
			<div>
				<h1 className="text-2xl font-semibold">Questionnaires</h1>
				<p className="text-sm text-muted-foreground">
					Every questionnaire sent to a client. Archived questionnaires are
					hidden unless you filter for them.
				</p>
			</div>

			{isError ? (
				<ErrorState
					message="Could not load questionnaires."
					onRetry={() => refetch()}
				/>
			) : isLoading ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-16 w-full" />
					<Skeleton className="h-96 w-full" />
				</div>
			) : (
				<>
					<div className="flex flex-wrap items-center gap-2">
						<Input
							className="w-64"
							onChange={(e) => setFilter("search", e.target.value)}
							placeholder="Search client or questionnaire..."
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
							{visibleRows.length} questionnaires across {visibleClientCount}{" "}
							clients
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
						<Table>
							<TableHeader>
								<TableRow>
									<SortableHead
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
										onSort={handleSort}
										sort={sort}
										sortDir={sortDir}
										sortKey="client"
									/>
									<SortableHead
										filter={
											<ColumnFilter
												columnName="Questionnaire"
												counts={typeCounts}
												onFilterChange={(values) => setFilter("types", values)}
												options={typeOptions}
												selectedValues={filters.types}
											/>
										}
										label="Questionnaire"
										onSort={handleSort}
										sort={sort}
										sortDir={sortDir}
										sortKey="type"
									/>
									<SortableHead
										filter={
											<ColumnFilter
												columnName="Status"
												counts={statusCounts}
												onFilterChange={(values) =>
													setFilter("statuses", values)
												}
												options={statusOptions}
												selectedValues={filters.statuses}
											/>
										}
										label="Status"
										onSort={handleSort}
										sort={sort}
										sortDir={sortDir}
										sortKey="status"
									/>
									<SortableHead
										label="Sent"
										onSort={handleSort}
										sort={sort}
										sortDir={sortDir}
										sortKey="sent"
									/>
									<SortableHead
										filter={
											<ColumnFilter
												columnName="Reminders"
												counts={remindedCounts}
												onFilterChange={(values) =>
													setFilter("reminded", values)
												}
												options={REMINDED_OPTIONS}
												selectedValues={filters.reminded}
											/>
										}
										label="Reminders"
										onSort={handleSort}
										sort={sort}
										sortDir={sortDir}
										sortKey="reminded"
									/>
									<SortableHead
										label="Last Reminded"
										onSort={handleSort}
										sort={sort}
										sortDir={sortDir}
										sortKey="lastReminded"
									/>
								</TableRow>
							</TableHeader>
							<TableBody>
								{visibleRows.length === 0 ? (
									<TableRow>
										<TableCell colSpan={6}>
											<EmptyState
												description={
													hasActiveFilters
														? "Try removing a filter."
														: undefined
												}
												icon={ClipboardList}
												title="No questionnaires found"
											/>
										</TableCell>
									</TableRow>
								) : (
									visibleRows.map((row) => (
										<TableRow key={row.id}>
											<TableCell className="font-medium">
												<Link
													className="hover:underline"
													href={`/clients/${row.clientHash}`}
												>
													<ClientHoverCard clientHash={row.clientHash}>
														<Redact>{row.clientName}</Redact>
													</ClientHoverCard>
												</Link>
												{!row.clientActive && (
													<span className="ml-2 text-xs text-muted-foreground">
														Inactive
													</span>
												)}
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
									))
								)}
							</TableBody>
						</Table>
					</div>
				</>
			)}
		</div>
	);
}

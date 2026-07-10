"use client";

import {
	ColumnFilter,
	type FilterOption,
	toFilterOptions,
} from "@components/shared/ColumnFilter";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
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
import { ArrowDown, ArrowUp, Columns3 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	CLIENT_COLOR_KEYS,
	type ClientColor,
	formatColorName,
	getHexFromColor,
} from "~/lib/colors";
import { ALLOWED_ASD_ADHD_VALUES, type PUNCH_SCHEMA } from "~/lib/constants";
import { cn, formatClientAge } from "~/lib/utils";
import { api } from "~/trpc/react";
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

function formatPriorityReason(sortReason: string, dob: Date) {
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
	| "secondaryInsurance";

const COLUMN_LABELS: Record<ColumnKey, string> = {
	priority: "Priority",
	for: "For",
	language: "Language",
	daQs: "DA Qs",
	evalQs: "EVAL Qs",
	insurance: "Primary Insurance",
	secondaryInsurance: "Secondary Insurance",
};

const TOGGLEABLE_COLUMNS: ColumnKey[] = [
	"priority",
	"for",
	"language",
	"daQs",
	"evalQs",
	"insurance",
	"secondaryInsurance",
];

// Not a real table column, just a badge next to the name, but its visibility
// is controlled the same way through the Columns menu.
const FAILURES_TOGGLE_KEY = "failures";
type ExtraToggleKey = typeof FAILURES_TOGGLE_KEY;
type ToggleKey = ColumnKey | ExtraToggleKey;

const ALL_TOGGLE_LABELS: Record<ToggleKey, string> = {
	[FAILURES_TOGGLE_KEY]: "Unresolved Failures",
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
	[FAILURES_TOGGLE_KEY]: true,
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
				"overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-in-out",
				visible ? "max-w-[240px] opacity-100" : "max-w-0 opacity-0",
			)}
		>
			{children}
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

interface DirectoryColumnFilterProps {
	label: string;
	values: string[];
	onToggle: (value: string) => void;
	onClear: () => void;
	options: FilterOption[];
	facet?: FacetCounts;
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
}: DirectoryColumnFilterProps) {
	return (
		<div className="flex items-center gap-1">
			{label}
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
	sort?: string;
	sortDir?: string;
	columns?: Partial<Record<ToggleKey, boolean>>;
}

function defaultSortDir(sort: string) {
	return sort === "addedDate" ? "desc" : "asc";
}

export function ClientDirectory() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const getArrayParam = (key: string) => {
		const raw = searchParams.get(key);
		return raw ? raw.split(",").filter(Boolean) : [];
	};

	const nameSearch = searchParams.get("name") ?? "";
	const asdAdhd = getArrayParam("for");
	const primaryInsurance = getArrayParam("insurance");
	const secondaryInsurance = getArrayParam("secondaryInsurance");
	const language = getArrayParam("language");
	const status = searchParams.get("status") ?? "active";
	const color = getArrayParam("color");
	const priority = getArrayParam("priority");
	const daQs = getArrayParam("daQs");
	const evalQs = getArrayParam("evalQs");
	const sort = searchParams.get("sort") ?? "name";
	const sortDir = searchParams.get("sortDir") ?? defaultSortDir(sort);

	const [isInitialized, setIsInitialized] = useState(false);
	const lastSavedFiltersRef = useRef("");

	const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE_COLUMNS);

	const toggleColumn = (key: ToggleKey) => {
		setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
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

	// The Status column only earns its keep when we're not already filtered to one status
	const statusColumnVisible = status === "all";

	const updateParam = (key: string, value: string, defaultValue = "") => {
		const params = new URLSearchParams(searchParams.toString());
		if (value && value !== defaultValue) params.set(key, value);
		else params.delete(key);
		router.push(`${pathname}?${params.toString()}`);
	};

	const toggleArrayParam = (key: string, value: string) => {
		const current = getArrayParam(key);
		const next = current.includes(value)
			? current.filter((v) => v !== value)
			: [...current, value];
		const params = new URLSearchParams(searchParams.toString());
		if (next.length > 0) params.set(key, next.join(","));
		else params.delete(key);
		router.push(`${pathname}?${params.toString()}`);
	};

	const clearArrayParam = (key: string) => {
		const params = new URLSearchParams(searchParams.toString());
		params.delete(key);
		router.push(`${pathname}?${params.toString()}`);
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

	const savedFilters = useMemo((): DirectoryFilters | null => {
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
			if (Date.now() - parsed.savedAt > FILTER_TIMEOUT_MS) return null;
			return parsed.filters ?? null;
		} catch {
			return null;
		}
	}, [savedFiltersData?.directoryFilters]);

	// Apply saved filters and column visibility on first load if the URL doesn't
	// already specify any filters (columns aren't part of the URL, so they're
	// always restored from the saved blob regardless).
	useEffect(() => {
		if (isInitialized || savedFiltersData === undefined) return;

		const hasFilterParams = Array.from(searchParams.keys()).some(
			(key) => key !== "name",
		);

		if (!hasFilterParams && savedFilters) {
			const params = new URLSearchParams(searchParams.toString());
			for (const [key, value] of Object.entries(savedFilters)) {
				if (key === "columns") continue;
				if (Array.isArray(value)) {
					if (value.length > 0) params.set(key, value.join(","));
				} else if (value) {
					params.set(key, value);
				}
			}
			router.replace(`${pathname}?${params.toString()}`);
		}

		if (savedFilters?.columns) {
			setVisibleColumns({
				...DEFAULT_VISIBLE_COLUMNS,
				...savedFilters.columns,
			});
		}

		lastSavedFiltersRef.current = JSON.stringify(savedFilters ?? {});
		setIsInitialized(true);
	}, [
		isInitialized,
		savedFiltersData,
		savedFilters,
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
		if (sort !== "name") filtersToSave.sort = sort;
		if (sortDir !== defaultSortDir(sort)) filtersToSave.sortDir = sortDir;
		if (
			JSON.stringify(visibleColumns) !== JSON.stringify(DEFAULT_VISIBLE_COLUMNS)
		) {
			filtersToSave.columns = visibleColumns;
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
	}, [isInitialized, searchParams, visibleColumns]);

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
		sort: sort as "name" | "addedDate" | "priority",
		sortDir: sortDir as "asc" | "desc",
	};

	const { data: rawClients, isLoading } =
		api.clients.directory.useQuery(queryFilters);
	const { data: facetCounts } =
		api.clients.directoryFacetCounts.useQuery(queryFilters);

	// DA Qs / EVAL Qs stage lives in the Google Sheets punchlist, not the DB,
	// so it can't be part of the SQL query and gets filtered here instead.
	const clients = useMemo(() => {
		if (!rawClients) return rawClients;

		return rawClients.filter((client) => {
			const punchRow = punchByClientId.get(String(client.id));

			if (effectiveDaQs.length > 0) {
				const stage = getQsStage("DA", punchRow) ?? NONE_FILTER_VALUE;
				if (!effectiveDaQs.includes(stage)) return false;
			}

			if (effectiveEvalQs.length > 0) {
				const stage = getQsStage("EVAL", punchRow) ?? NONE_FILTER_VALUE;
				if (!effectiveEvalQs.includes(stage)) return false;
			}

			return true;
		});
	}, [rawClients, punchByClientId, effectiveDaQs, effectiveEvalQs]);

	const insuranceOptions: FilterOption[] = useMemo(
		() =>
			(allInsurances ?? []).map((insurance) => ({
				value: insurance.shortName,
				label: insurance.shortName,
			})),
		[allInsurances],
	);

	return (
		<div className="flex w-full flex-col gap-4 p-4">
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
						onDebouncedChange={(value) => updateParam("name", value)}
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
				<div className="flex gap-1">
					<Select
						onValueChange={(value) => {
							const params = new URLSearchParams(searchParams.toString());
							if (value !== "name") params.set("sort", value);
							else params.delete("sort");
							params.delete("sortDir");
							router.push(`${pathname}?${params.toString()}`);
						}}
						value={sort}
					>
						<SelectTrigger className="w-full sm:w-40">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="name">Sort: Name</SelectItem>
							<SelectItem value="addedDate">Sort: Added Date</SelectItem>
							<SelectItem value="priority">Sort: Priority</SelectItem>
						</SelectContent>
					</Select>
					<Button
						aria-label={
							sortDir === "asc" ? "Sort ascending" : "Sort descending"
						}
						disabled={sort === "priority"}
						onClick={() =>
							updateParam(
								"sortDir",
								sortDir === "asc" ? "desc" : "asc",
								defaultSortDir(sort),
							)
						}
						size="icon"
						variant="outline"
					>
						{sortDir === "asc" ? (
							<ArrowDown className="h-4 w-4" />
						) : (
							<ArrowUp className="h-4 w-4" />
						)}
					</Button>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button className="w-full sm:w-auto" size="sm" variant="outline">
							<Columns3 className="h-4 w-4" />
							Columns
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						{(Object.keys(ALL_TOGGLE_LABELS) as ToggleKey[]).map((key) => (
							<DropdownMenuCheckboxItem
								checked={visibleColumns[key]}
								key={key}
								onCheckedChange={() => toggleColumn(key)}
								onSelect={(e) => e.preventDefault()}
							>
								{ALL_TOGGLE_LABELS[key]}
							</DropdownMenuCheckboxItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>
							<DirectoryColumnFilter
								label="Name"
								onClear={() => clearArrayParam("color")}
								onToggle={(value) => toggleArrayParam("color", value)}
								options={BASE_COLOR_OPTIONS}
								values={color}
							/>
						</TableHead>
						<TableHead className={collapsibleCellClass(statusColumnVisible)}>
							<AnimatedCellContent visible={statusColumnVisible}>
								Status
							</AnimatedCellContent>
						</TableHead>
						<TableHead
							className={collapsibleCellClass(visibleColumns.priority)}
						>
							<AnimatedCellContent visible={visibleColumns.priority}>
								<DirectoryColumnFilter
									facet={facetCounts?.priority}
									label="Priority"
									onClear={() => clearArrayParam("priority")}
									onToggle={(value) => toggleArrayParam("priority", value)}
									options={PRIORITY_FILTER_OPTIONS}
									values={priority}
								/>
							</AnimatedCellContent>
						</TableHead>
						<TableHead className={collapsibleCellClass(visibleColumns.for)}>
							<AnimatedCellContent visible={visibleColumns.for}>
								<DirectoryColumnFilter
									facet={facetCounts?.asdAdhd}
									label="For"
									onClear={() => clearArrayParam("for")}
									onToggle={(value) => toggleArrayParam("for", value)}
									options={withNone(toFilterOptions(ALLOWED_ASD_ADHD_VALUES))}
									values={asdAdhd}
								/>
							</AnimatedCellContent>
						</TableHead>
						<TableHead
							className={collapsibleCellClass(visibleColumns.language)}
						>
							<AnimatedCellContent visible={visibleColumns.language}>
								<DirectoryColumnFilter
									facet={facetCounts?.language}
									label="Language"
									onClear={() => clearArrayParam("language")}
									onToggle={(value) => toggleArrayParam("language", value)}
									options={withNone(toFilterOptions(languageOptions ?? []))}
									values={language}
								/>
							</AnimatedCellContent>
						</TableHead>
						<TableHead className={collapsibleCellClass(visibleColumns.daQs)}>
							<AnimatedCellContent visible={visibleColumns.daQs}>
								<DirectoryColumnFilter
									label="DA Qs"
									onClear={() => clearArrayParam("daQs")}
									onToggle={(value) => toggleArrayParam("daQs", value)}
									options={QS_FILTER_OPTIONS}
									values={daQs}
								/>
							</AnimatedCellContent>
						</TableHead>
						<TableHead className={collapsibleCellClass(visibleColumns.evalQs)}>
							<AnimatedCellContent visible={visibleColumns.evalQs}>
								<DirectoryColumnFilter
									label="EVAL Qs"
									onClear={() => clearArrayParam("evalQs")}
									onToggle={(value) => toggleArrayParam("evalQs", value)}
									options={QS_FILTER_OPTIONS}
									values={evalQs}
								/>
							</AnimatedCellContent>
						</TableHead>
						<TableHead
							className={collapsibleCellClass(visibleColumns.insurance)}
						>
							<AnimatedCellContent visible={visibleColumns.insurance}>
								<DirectoryColumnFilter
									facet={facetCounts?.primaryInsurance}
									label="Primary Insurance"
									onClear={() => clearArrayParam("insurance")}
									onToggle={(value) => toggleArrayParam("insurance", value)}
									options={withNone(insuranceOptions)}
									values={primaryInsurance}
								/>
							</AnimatedCellContent>
						</TableHead>
						<TableHead
							className={collapsibleCellClass(
								visibleColumns.secondaryInsurance,
							)}
						>
							<AnimatedCellContent visible={visibleColumns.secondaryInsurance}>
								<DirectoryColumnFilter
									facet={facetCounts?.secondaryInsurance}
									label="Secondary Insurance"
									onClear={() => clearArrayParam("secondaryInsurance")}
									onToggle={(value) =>
										toggleArrayParam("secondaryInsurance", value)
									}
									options={withNone(insuranceOptions)}
									values={secondaryInsurance}
								/>
							</AnimatedCellContent>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{isLoading ? (
						Array.from({ length: 5 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
							<TableRow key={i}>
								<TableCell>
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
						clients.map((client) => {
							const isPriority = PRIORITY_REASONS.has(client.sortReason);

							return (
								<TableRow
									key={client.id}
									style={{
										contentVisibility: "auto",
										containIntrinsicSize: "auto 41px",
									}}
								>
									<TableCell className="font-medium">
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
												{client.fullName}
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
									<TableCell
										className={collapsibleCellClass(statusColumnVisible)}
									>
										<AnimatedCellContent visible={statusColumnVisible}>
											<span className="text-muted-foreground">
												{client.status ? "Active" : "Inactive"}
											</span>
										</AnimatedCellContent>
									</TableCell>
									<TableCell
										className={collapsibleCellClass(visibleColumns.priority)}
									>
										<AnimatedCellContent visible={visibleColumns.priority}>
											<span
												className={cn(
													"text-muted-foreground",
													isPriority && "font-medium text-destructive",
												)}
											>
												{isPriority
													? formatPriorityReason(
															client.sortReason,
															new Date(client.dob),
														)
													: "—"}
											</span>
										</AnimatedCellContent>
									</TableCell>
									<TableCell
										className={collapsibleCellClass(visibleColumns.for)}
									>
										<AnimatedCellContent visible={visibleColumns.for}>
											<span className="text-muted-foreground">
												{client.asdAdhd ?? "—"}
											</span>
										</AnimatedCellContent>
									</TableCell>
									<TableCell
										className={collapsibleCellClass(visibleColumns.language)}
									>
										<AnimatedCellContent visible={visibleColumns.language}>
											<span className="text-muted-foreground">
												{client.language ?? "—"}
											</span>
										</AnimatedCellContent>
									</TableCell>
									<TableCell
										className={collapsibleCellClass(visibleColumns.daQs)}
									>
										<AnimatedCellContent visible={visibleColumns.daQs}>
											<span className="text-muted-foreground">
												{getQsStage(
													"DA",
													punchByClientId.get(String(client.id)),
												) ?? "—"}
											</span>
										</AnimatedCellContent>
									</TableCell>
									<TableCell
										className={collapsibleCellClass(visibleColumns.evalQs)}
									>
										<AnimatedCellContent visible={visibleColumns.evalQs}>
											<span className="text-muted-foreground">
												{getQsStage(
													"EVAL",
													punchByClientId.get(String(client.id)),
												) ?? "—"}
											</span>
										</AnimatedCellContent>
									</TableCell>
									<TableCell
										className={collapsibleCellClass(visibleColumns.insurance)}
									>
										<AnimatedCellContent visible={visibleColumns.insurance}>
											<span className="text-muted-foreground">
												{client.primaryInsurance ?? "—"}
											</span>
										</AnimatedCellContent>
									</TableCell>
									<TableCell
										className={collapsibleCellClass(
											visibleColumns.secondaryInsurance,
										)}
									>
										<AnimatedCellContent
											visible={visibleColumns.secondaryInsurance}
										>
											<span className="text-muted-foreground">
												{client.secondaryInsurance.length > 0
													? client.secondaryInsurance.join(", ")
													: "—"}
											</span>
										</AnimatedCellContent>
									</TableCell>
								</TableRow>
							);
						})
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
		</div>
	);
}

"use client";

import { ColumnFilter, toFilterOptions } from "@components/shared/ColumnFilter";
import { Button } from "@components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@components/ui/dropdown-menu";
import { Input } from "@components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@components/ui/tabs";
import { Textarea } from "@components/ui/textarea";
import { keepPreviousData } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Skeleton } from "@ui/skeleton";
import {
	ArchiveRestore,
	ChevronDown,
	ChevronUp,
	Circle,
	Loader2,
	X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
	memo,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { ScheduledClient } from "~/lib/api-types";
import {
	formatColorName,
	isSchedulingColor,
	SCHEDULING_COLOR_KEYS,
	SCHEDULING_COLOR_MAP,
	type SchedulingColor,
} from "~/lib/colors";
import type {
	Evaluator,
	InsuranceWithAliases,
	Office,
	SchoolDistrict,
} from "~/lib/models";
import {
	cn,
	formatClientAge,
	getLocalDayFromUTCDate,
	mapInsuranceToShortNames,
} from "~/lib/utils";
import { api } from "~/trpc/react";

// --- Types & Utilities ---

export interface SchedulingUpdateData {
	evaluatorNpi?: number | null;
	date?: string;
	time?: string;
	office?: string;
	notes?: string;
	code?: string;
	color?: string | null;
	sort?: number;
}

// --- Internal Hooks ---

function useTableScroll(storageKey?: string, isReady?: boolean) {
	const [isScrolledLeft, setIsScrolledLeft] = useState(false);
	const [isScrolledTop, setIsScrolledTop] = useState(false);
	const tableRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const table = tableRef.current;
		if (!table || !isReady) return;

		if (storageKey) {
			const saved = sessionStorage.getItem(storageKey);
			if (saved) {
				const { left, top } = JSON.parse(saved);
				table.scrollLeft = left;
				table.scrollTop = top;
			}
		}

		const handleScroll = () => {
			setIsScrolledLeft(table.scrollLeft > 0);
			setIsScrolledTop(table.scrollTop > 0);

			if (storageKey) {
				sessionStorage.setItem(
					storageKey,
					JSON.stringify({ left: table.scrollLeft, top: table.scrollTop }),
				);
			}
		};

		handleScroll();

		table.addEventListener("scroll", handleScroll);
		return () => table.removeEventListener("scroll", handleScroll);
	}, [storageKey, isReady]);

	return { isScrolledLeft, isScrolledTop, tableRef };
}

// Manages filter state + its session-backed persistence. The filter values
// themselves are sent to the server as query input (see SchedulingTableView),
// except "age" which stays client-side since it's computed from dob, not a
// column the server can group/filter on cleanly.
function useSchedulingFilterState(type: "active" | "archived") {
	const utils = api.useUtils();
	const [filters, setFilters] = useState<Record<string, string[]>>({});
	const [isInitialized, setIsInitialized] = useState(false);
	const lastSavedFiltersRef = useRef<string | null>(null);
	const { data: session } = useSession();

	const savedFiltersQuery = api.sessions.getSchedulingFilters.useQuery(
		{ type },
		{
			enabled: !!session,
			staleTime: 300000,
			gcTime: 600000,
			refetchOnWindowFocus: false,
		},
	);

	const saveFiltersMutation = api.sessions.saveSchedulingFilters.useMutation({
		onSuccess: (_data, variables) => {
			utils.sessions.getSchedulingFilters.setData(
				{ type: variables.type },
				{ schedulingFilters: variables.schedulingFilters },
			);
		},
	});

	useEffect(() => {
		if (savedFiltersQuery.isSuccess && !isInitialized) {
			const saved = savedFiltersQuery.data?.schedulingFilters;
			if (saved) {
				try {
					const parsed = JSON.parse(saved);
					setFilters(parsed);
					lastSavedFiltersRef.current = saved;
				} catch (e) {
					console.error(`Failed to parse saved ${type} scheduling filters`, e);
					lastSavedFiltersRef.current = "{}";
				}
			} else {
				lastSavedFiltersRef.current = "{}";
			}
			setIsInitialized(true);
		}
	}, [
		savedFiltersQuery.isSuccess,
		savedFiltersQuery.data,
		isInitialized,
		type,
	]);

	useEffect(() => {
		if (!isInitialized || !session || saveFiltersMutation.isPending) return;

		const filtersString = JSON.stringify(filters);
		if (
			lastSavedFiltersRef.current !== null &&
			filtersString !== lastSavedFiltersRef.current
		) {
			lastSavedFiltersRef.current = filtersString;
			saveFiltersMutation.mutate({ type, schedulingFilters: filtersString });
		}
	}, [filters, session, saveFiltersMutation, isInitialized, type]);

	const handleFilterChange = (column: string, selected: string[]) => {
		setFilters((prev) => {
			const newFilters = { ...prev };
			if (selected.length === 0) {
				delete newFilters[column];
			} else {
				newFilters[column] = selected;
			}
			return newFilters;
		});
	};

	return { filters, handleFilterChange, isInitialized };
}

// --- UI Components ---

// Mirrors each real column's cell width constraints (see SchedulingTableRow)
// and approximates its content: h-9 for a Select/Input-shaped column, h-10
// for the Notes textarea, h-4 for plain text, so row height and column widths
// read as the real table rather than a generic mockup.
const SKELETON_COLUMNS: {
	cellClassName?: string;
	skeletonClassName: string;
}[] = [
	{ cellClassName: "max-w-[200px]", skeletonClassName: "h-9 w-40" }, // Name
	{ skeletonClassName: "h-9 w-32" }, // Evaluator
	{
		cellClassName: "min-w-[200px] max-w-[200px]",
		skeletonClassName: "h-10 w-full",
	}, // Notes
	{
		cellClassName: "min-w-[100px] max-w-[120px]",
		skeletonClassName: "h-9 w-full",
	}, // Date
	{
		cellClassName: "min-w-[100px] max-w-[120px]",
		skeletonClassName: "h-9 w-full",
	}, // Time
	{ skeletonClassName: "h-4 w-16" }, // ASD/ADHD
	{ skeletonClassName: "h-4 w-28" }, // Insurance
	{ skeletonClassName: "h-9 w-24" }, // Code
	{ cellClassName: "min-w-fit", skeletonClassName: "h-9 w-32" }, // Location
	{ skeletonClassName: "h-4 w-28" }, // District
	{ skeletonClassName: "h-4 w-20" }, // PA Date
	{ skeletonClassName: "h-4 w-10" }, // Age
	{ skeletonClassName: "h-9 w-20" }, // Actions
];

function SchedulingTableSkeleton() {
	// The scheduling sheet routinely has hundreds of rows, so the loading
	// state should read as a dense, scrollable sheet, not a few centered bars.
	const rowCount = 30;

	return (
		<>
			<div className="flex items-center gap-1 px-4 py-2">
				<Skeleton className="h-4 w-24" />
			</div>
			<Table className="min-w-max" classNameWrapper="min-h-0 flex-1">
				<TableHeader>
					<TableRow>
						{SKELETON_COLUMNS.map((col, i) => (
							<TableHead
								className={col.cellClassName}
								// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
								key={i}
							>
								<Skeleton className="h-4 w-16" />
							</TableHead>
						))}
					</TableRow>
				</TableHeader>
				<TableBody>
					{Array.from({ length: rowCount }).map((_, rowIdx) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
						<TableRow key={rowIdx}>
							{SKELETON_COLUMNS.map((col, colIdx) => (
								<TableCell
									className={col.cellClassName}
									// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
									key={colIdx}
								>
									<Skeleton className={col.skeletonClassName} />
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</>
	);
}

function RowCountDisplay({
	filteredCount,
	totalCount,
}: {
	filteredCount: number;
	totalCount: number;
}) {
	const isFiltered = filteredCount !== totalCount;

	return (
		<div className="flex items-center gap-1 px-4 py-2 text-muted-foreground text-sm">
			{isFiltered ? (
				<>
					<span className="font-medium text-foreground">{filteredCount}</span>
					<span>of</span>
					<span className="font-medium">{totalCount}</span>
					<span>rows displayed</span>
				</>
			) : (
				<>
					<span className="font-medium text-foreground">{totalCount}</span>
					<span>{totalCount === 1 ? "row" : "rows"}</span>
				</>
			)}
		</div>
	);
}

function ColorPicker({
	value,
	onChange,
	disabled,
}: {
	value?: SchedulingColor;
	onChange: (value: SchedulingColor | null) => void;
	disabled?: boolean;
}) {
	if (disabled) {
		return (
			<Circle
				className="h-4 w-4"
				fill={value ? SCHEDULING_COLOR_MAP[value] : "transparent"}
				style={{
					color: value ? SCHEDULING_COLOR_MAP[value] : "currentColor",
				}}
			/>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button className="cursor-pointer" size="icon-sm" variant="ghost">
					<Circle
						className="h-4 w-4"
						fill={value ? SCHEDULING_COLOR_MAP[value] : "transparent"}
						style={{
							color: value ? SCHEDULING_COLOR_MAP[value] : "currentColor",
						}}
					/>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start">
				<DropdownMenuItem
					className="cursor-pointer"
					onClick={() => onChange(null)}
					onSelect={() => onChange(null)}
				>
					No Color
				</DropdownMenuItem>
				{SCHEDULING_COLOR_KEYS.sort((a, b) => a.localeCompare(b)).map(
					(color) => (
						<DropdownMenuItem
							className="cursor-pointer"
							key={color}
							onClick={() => onChange(color)}
							onSelect={() => onChange(color)}
						>
							<div className="flex items-center gap-2">
								<div
									className="h-4 w-4 rounded-full"
									style={{ backgroundColor: SCHEDULING_COLOR_MAP[color] }}
								/>
								{formatColorName(color)}
							</div>
						</DropdownMenuItem>
					),
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function EvaluatorSelect({
	clientId,
	allEvaluators,
	value,
	onChange,
	disabled,
}: {
	clientId: number;
	allEvaluators: Evaluator[];
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}) {
	const [hasBeenOpened, setHasBeenOpened] = useState(false);
	const { data: eligibleEvaluators, isLoading } =
		api.evaluators.getEligibleForClient.useQuery(clientId, {
			enabled: !disabled && hasBeenOpened,
		});

	const { eligible, other } = useMemo(() => {
		// allEvaluators is pre-sorted by providerName, so filtering preserves order.
		if (!eligibleEvaluators || eligibleEvaluators.length === 0) {
			return { eligible: [], other: allEvaluators };
		}
		const eligibleNpis = new Set(eligibleEvaluators.map((e) => e.npi));
		const eligible = allEvaluators.filter((e) => eligibleNpis.has(e.npi));
		const other = allEvaluators.filter((e) => !eligibleNpis.has(e.npi));
		return { eligible, other };
	}, [allEvaluators, eligibleEvaluators]);

	if (disabled) {
		const evaluator = allEvaluators.find((e) => e.npi.toString() === value);
		return <span>{evaluator?.providerName.split(" ")[0] ?? "-"}</span>;
	}

	return (
		<Select
			onOpenChange={(open) => open && setHasBeenOpened(true)}
			onValueChange={onChange}
			value={value === "none" ? "" : value}
		>
			<SelectTrigger>
				<SelectValue placeholder="Evaluator" />
			</SelectTrigger>
			<SelectContent>
				{isLoading ? (
					<div className="p-2 text-muted-foreground text-sm">Loading...</div>
				) : (
					<>
						<SelectItem value="none">None</SelectItem>
						<SelectSeparator />
						{eligible.map((evaluator) => (
							<SelectItem key={evaluator.npi} value={evaluator.npi.toString()}>
								{evaluator.providerName.split(" ")[0]}
							</SelectItem>
						))}
						{eligible.length > 0 && other.length > 0 && <SelectSeparator />}
						{eligible.length > 0 && other.length > 0 && (
							<span className="text-[8pt] text-muted-foreground">
								Ineligible
							</span>
						)}
						{other.map((evaluator) => (
							<SelectItem key={evaluator.npi} value={evaluator.npi.toString()}>
								{evaluator.providerName.split(" ")[0]}
							</SelectItem>
						))}
					</>
				)}
			</SelectContent>
		</Select>
	);
}

const SchedulingTableRow = memo(function SchedulingTableRow({
	scheduledClient,
	evaluators,
	offices,
	districts,
	insurances,
	isEditable,
	onUpdate,
	onMove,
	upNeighborId,
	downNeighborId,
	onAction,
	actionIcon,
	actionVariant,
	isActionPending,
	isScrolledLeft,
	rowIndex,
	measureElement,
}: {
	scheduledClient: ScheduledClient;
	evaluators: Evaluator[];
	offices: Office[];
	districts: SchoolDistrict[];
	insurances: InsuranceWithAliases[];
	isEditable?: boolean;
	onUpdate?: (clientId: number, data: SchedulingUpdateData) => void;
	onMove?: (clientId: number, neighborClientId: number) => void;
	upNeighborId?: number;
	downNeighborId?: number;
	onAction: (clientId: number) => void;
	actionIcon: React.ReactNode;
	actionVariant: "default" | "destructive";
	isActionPending: boolean;
	isScrolledLeft?: boolean;
	rowIndex: number;
	measureElement: (el: Element | null) => void;
}) {
	const [localDate, setLocalDate] = useState(scheduledClient.date ?? "");
	const [localTime, setLocalTime] = useState(scheduledClient.time ?? "");
	const [localNotes, setLocalNotes] = useState(scheduledClient.notes ?? "");

	useEffect(() => {
		setLocalDate(scheduledClient.date ?? "");
	}, [scheduledClient.date]);

	useEffect(() => {
		setLocalTime(scheduledClient.time ?? "");
	}, [scheduledClient.time]);

	useEffect(() => {
		setLocalNotes(scheduledClient.notes ?? "");
	}, [scheduledClient.notes]);

	const districtMap = useMemo(
		() => new Map(districts.map((d) => [d.fullName, d])),
		[districts],
	);

	const districtDisplay = useMemo(() => {
		const fullName = scheduledClient.client.schoolDistrict;
		if (!fullName) return "-";
		const district = districtMap.get(fullName);
		if (district?.shortName) return district.shortName;
		return fullName.replace(/ (County )?School District/, "");
	}, [scheduledClient.client.schoolDistrict, districtMap]);

	const color =
		scheduledClient.color && isSchedulingColor(scheduledClient.color)
			? (scheduledClient.color as SchedulingColor)
			: undefined;

	const backgroundColor = color
		? `color-mix(in srgb, ${SCHEDULING_COLOR_MAP[color]}, var(--background) 90%)`
		: "var(--background)";

	return (
		<TableRow
			className="hover:bg-inherit"
			data-client-id={scheduledClient.clientId}
			data-index={rowIndex}
			key={scheduledClient.clientId}
			ref={measureElement}
			style={{ backgroundColor }}
		>
			<TableCell
				className={cn(
					"sticky left-0 z-10 bg-background transition-shadow duration-200",
					"max-w-[200px]",
					isScrolledLeft && "shadow-lg",
				)}
				data-col={0}
				data-row={rowIndex}
				style={{
					backgroundColor: color
						? `color-mix(in srgb, ${SCHEDULING_COLOR_MAP[color]}, var(--background) 90%)`
						: "var(--background)",
				}}
			>
				<div className="flex items-center gap-2 overflow-hidden">
					{isEditable && (
						<div className="flex flex-col items-center justify-center">
							<button
								className="cursor-pointer rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-primary disabled:opacity-30"
								disabled={upNeighborId === undefined}
								onClick={() =>
									upNeighborId !== undefined &&
									onMove?.(scheduledClient.clientId, upNeighborId)
								}
								title="Move Up"
								type="button"
							>
								<ChevronUp className="h-4 w-4" />
							</button>
							<button
								className="cursor-pointer rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-primary disabled:opacity-30"
								disabled={downNeighborId === undefined}
								onClick={() =>
									downNeighborId !== undefined &&
									onMove?.(scheduledClient.clientId, downNeighborId)
								}
								title="Move Down"
								type="button"
							>
								<ChevronDown className="h-4 w-4" />
							</button>
						</div>
					)}
					<ColorPicker
						disabled={!isEditable}
						onChange={(value) => {
							if (value !== (scheduledClient.color as SchedulingColor | null)) {
								onUpdate?.(scheduledClient.clientId, { color: value });
							}
						}}
						value={color}
					/>
					<Link
						className="truncate hover:underline"
						href={`/clients/${scheduledClient.client.hash}`}
						title={scheduledClient.client.fullName}
					>
						{scheduledClient.client.fullName}
					</Link>
				</div>
			</TableCell>
			<TableCell data-col={1} data-row={rowIndex}>
				<EvaluatorSelect
					allEvaluators={evaluators}
					clientId={scheduledClient.clientId}
					disabled={!isEditable}
					onChange={(value) => {
						const currentVal = scheduledClient.evaluator?.toString() ?? "none";
						if (value !== currentVal) {
							onUpdate?.(scheduledClient.clientId, {
								evaluatorNpi: value === "none" ? null : parseInt(value, 10),
							});
						}
					}}
					value={scheduledClient.evaluator?.toString() ?? "none"}
				/>
			</TableCell>

			<TableCell
				className="min-w-[200px] max-w-[200px]"
				data-col={2}
				data-row={rowIndex}
			>
				{isEditable ? (
					<Textarea
						className="max-h-[2.5rem] min-h-[2.5rem] resize-none transition-all duration-200 focus:min-h-[10rem]"
						onBlur={() => {
							if (localNotes !== (scheduledClient.notes ?? "")) {
								onUpdate?.(scheduledClient.clientId, {
									notes: localNotes,
								});
							}
						}}
						onChange={(e) => setLocalNotes(e.target.value)}
						value={localNotes}
					/>
				) : (
					<div className="wrap-break-word max-h-[2.5rem] overflow-hidden overscroll-auto text-sm">
						{scheduledClient.notes || "-"}
					</div>
				)}
			</TableCell>

			<TableCell
				className="min-w-[100px] max-w-[120px]"
				data-col={3}
				data-row={rowIndex}
			>
				{isEditable ? (
					<Input
						onBlur={() => {
							if (localDate !== (scheduledClient.date ?? "")) {
								onUpdate?.(scheduledClient.clientId, { date: localDate });
							}
						}}
						onChange={(e) => setLocalDate(e.target.value)}
						value={localDate}
					/>
				) : (
					scheduledClient.date || "-"
				)}
			</TableCell>

			<TableCell
				className="min-w-[100px] max-w-[120px]"
				data-col={4}
				data-row={rowIndex}
			>
				{isEditable ? (
					<Input
						onBlur={() => {
							if (localTime !== (scheduledClient.time ?? "")) {
								onUpdate?.(scheduledClient.clientId, { time: localTime });
							}
						}}
						onChange={(e) => setLocalTime(e.target.value)}
						value={localTime}
					/>
				) : (
					scheduledClient.time || "-"
				)}
			</TableCell>

			<TableCell data-col={5} data-row={rowIndex}>
				{scheduledClient.client.asdAdhd || "-"}
			</TableCell>

			<TableCell data-col={6} data-row={rowIndex}>
				{mapInsuranceToShortNames(
					scheduledClient.client.primaryInsurance,
					scheduledClient.client.secondaryInsurance,
					insurances,
				) || "-"}
			</TableCell>

			<TableCell data-col={7} data-row={rowIndex}>
				{isEditable ? (
					<Select
						onValueChange={(value) => {
							if (value !== (scheduledClient.code as string | null)) {
								const updates: SchedulingUpdateData = { code: value };
								if (value === "90791") {
									updates.office = "Virtual";
								} else if (value === "96136") {
									updates.office =
										scheduledClient.client.closestOfficeKey ?? "";
								}

								onUpdate?.(scheduledClient.clientId, updates);
							}
						}}
						value={(scheduledClient.code as string | null) ?? ""}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select Code" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="90791">90791</SelectItem>
							<SelectItem value="96136">96136</SelectItem>
						</SelectContent>
					</Select>
				) : (
					(scheduledClient.code as string) || "-"
				)}
			</TableCell>

			<TableCell className="min-w-fit" data-col={8} data-row={rowIndex}>
				{isEditable ? (
					<Select
						onValueChange={(value) => {
							if (value !== (scheduledClient.office as string | null)) {
								onUpdate?.(scheduledClient.clientId, { office: value });
							}
						}}
						value={(scheduledClient.office as string | null) ?? ""}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select Office">
								{scheduledClient.office === "Virtual"
									? "V"
									: (scheduledClient.office as string | null) || undefined}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="Virtual">Virtual</SelectItem>
							{offices.map((office) => (
								<SelectItem key={office.key} value={office.key}>
									{office.prettyName}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : scheduledClient.office === "Virtual" ? (
					"V"
				) : (
					scheduledClient.office || "-"
				)}
			</TableCell>

			<TableCell data-col={9} data-row={rowIndex}>
				{districtDisplay}
			</TableCell>

			<TableCell data-col={10} data-row={rowIndex}>
				{scheduledClient.client.precertExpires
					? getLocalDayFromUTCDate(
							scheduledClient.client.precertExpires,
						)?.toLocaleDateString() || "-"
					: "-"}
			</TableCell>

			<TableCell data-col={11} data-row={rowIndex}>
				{scheduledClient.client.dob
					? formatClientAge(scheduledClient.client.dob, "short")
					: "-"}
			</TableCell>

			<TableCell data-col={12} data-row={rowIndex}>
				<Button
					disabled={isActionPending}
					onClick={() => onAction(scheduledClient.clientId)}
					size="sm"
					variant={actionVariant}
				>
					{isActionPending ? (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					) : (
						actionIcon
					)}
				</Button>
			</TableCell>
		</TableRow>
	);
});

// --- Main Table Components ---

interface InternalSchedulingTableProps {
	type: "active" | "archived";
	clients: ScheduledClient[];
	evaluators: Evaluator[];
	offices: Office[];
	districts: SchoolDistrict[];
	insurances: InsuranceWithAliases[];
	isEditable: boolean;
	onUpdate?: (clientId: number, data: SchedulingUpdateData) => void;
	onMove?: (clientId: number, neighborClientId: number) => void;
	onAction: (clientId: number) => void;
	actionIcon: React.ReactNode;
	actionVariant: "default" | "destructive";
	isActionPending: boolean;
	lastAddedClientId?: number | null;
	onScrollToClient?: () => void;
	isInitialized: boolean;
	filters: Record<string, string[]>;
	handleFilterChange: (column: string, selected: string[]) => void;
	// Options + counts for every server-filterable column, keyed by filterKey.
	// "age" isn't included here - it's computed client-side below, since it's
	// derived from dob rather than a column the server groups/filters on.
	columnOptions: Record<string, string[]>;
	columnCounts: Record<string, Record<string, number>>;
	isFetching: boolean;
}

function InternalSchedulingTable({
	type,
	clients,
	evaluators,
	offices,
	districts,
	insurances,
	isEditable,
	onUpdate,
	onMove,
	onAction,
	actionIcon,
	actionVariant,
	isActionPending,
	lastAddedClientId,
	onScrollToClient,
	isInitialized,
	filters,
	handleFilterChange,
	columnOptions,
	columnCounts,
	isFetching,
}: InternalSchedulingTableProps) {
	const { isScrolledLeft, isScrolledTop, tableRef } = useTableScroll(
		`scheduling-scroll-${type}`,
		isInitialized,
	);

	// Removing/loosening a filter can mean hundreds of new rows mount at once,
	// each with several form controls - real, unavoidable work. Deferring the
	// list keeps that mount off the blocking render path so the page stays
	// responsive (filter checkboxes, scrolling) while it catches up, instead of
	// freezing for the duration of the commit.
	const deferredClients = useDeferredValue(clients);
	// Stale covers both windows: the network round-trip after a filter change
	// (isFetching, while placeholderData keeps the old rows visible) and the
	// deferred commit once new rows actually arrive (deferredClients lagging).
	const isStale = isFetching || deferredClients !== clients;

	// Age is filtered client-side over the already server-filtered `clients`,
	// mirroring how the client directory keeps its Google-Sheets-derived
	// DA/EVAL Qs filters client-side instead of pushing them into SQL.
	const ageOptions = useMemo(() => {
		const set = new Set<string>();
		for (const c of deferredClients) {
			if (c.client.dob) set.add(formatClientAge(c.client.dob, "short"));
		}
		return Array.from(set).sort();
	}, [deferredClients]);

	const filteredClients = useMemo(() => {
		const ageFilter = filters.age;
		if (!ageFilter?.length) return deferredClients;
		return deferredClients.filter((c) => {
			const age = c.client.dob ? formatClientAge(c.client.dob, "short") : "";
			return ageFilter.includes(age);
		});
	}, [deferredClients, filters.age]);

	// Sorted once here instead of per-row: EvaluatorSelect used to re-sort the
	// full evaluator list on every row's first render, even for rows whose
	// dropdown was never opened.
	const sortedEvaluators = useMemo(
		() =>
			[...evaluators].sort((a, b) =>
				a.providerName.localeCompare(b.providerName),
			),
		[evaluators],
	);

	// Only mounts the rows actually in (or near) the viewport, instead of every
	// row in the filtered set - hundreds of rows each with several form
	// controls is real, otherwise-unavoidable mount cost every time the
	// filtered set changes.
	const rowVirtualizer = useVirtualizer({
		count: filteredClients.length,
		getScrollElement: () => tableRef.current,
		estimateSize: () => 45,
		overscan: 10,
	});
	const virtualRows = rowVirtualizer.getVirtualItems();
	const virtualTotalSize = rowVirtualizer.getTotalSize();
	const paddingTop = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0;
	const paddingBottom =
		virtualRows.length > 0
			? virtualTotalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)
			: 0;

	// Scrolls to a newly added client by index rather than querying the DOM
	// for its row, since a just-added client's row may not be mounted yet.
	// biome-ignore lint/correctness/useExhaustiveDependencies: rowVirtualizer is not a stable reference across renders and would refire this every render
	useEffect(() => {
		if (!lastAddedClientId || !isInitialized || filteredClients.length === 0) {
			return;
		}
		const index = filteredClients.findIndex(
			(c) => c.clientId === lastAddedClientId,
		);
		if (index === -1) return;
		rowVirtualizer.scrollToIndex(index, {
			align: "center",
			behavior: "smooth",
		});
		onScrollToClient?.();
	}, [lastAddedClientId, isInitialized, filteredClients, onScrollToClient]);

	// Row/col cell the user tried to navigate to via arrow keys while its row
	// wasn't mounted (virtualized out). Resolved once the row mounts, see the
	// effect below.
	const pendingFocusRef = useRef<{
		row: number;
		col: number;
		direction: string;
	} | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: tableRef.current is a ref, not reactive state; this should only rerun when the virtualizer's mounted range changes
	useEffect(() => {
		const pending = pendingFocusRef.current;
		if (!pending || !tableRef.current) return;

		const targetCell = tableRef.current.querySelector(
			`td[data-row="${pending.row}"][data-col="${pending.col}"]`,
		);
		if (!targetCell) return;

		const focusable = targetCell.querySelector(
			"input, textarea, button, [tabindex='0']",
		) as HTMLElement | null;
		if (!focusable) return;

		focusable.focus();
		if (
			focusable instanceof HTMLInputElement ||
			focusable instanceof HTMLTextAreaElement
		) {
			focusable.select();
		}
		pendingFocusRef.current = null;
	}, [rowVirtualizer.range?.startIndex, rowVirtualizer.range?.endIndex]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		const key = e.key;
		if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key))
			return;

		const target = e.target as HTMLElement;
		const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

		if (isInput) {
			const input = target as HTMLInputElement | HTMLTextAreaElement;
			const { selectionStart, selectionEnd, value } = input;

			if (key === "ArrowLeft" && (selectionStart !== 0 || selectionEnd !== 0))
				return;
			if (
				key === "ArrowRight" &&
				(selectionStart !== value.length || selectionEnd !== value.length)
			)
				return;

			if (target.tagName === "TEXTAREA") {
				if (key === "ArrowUp") {
					const lines = value.substring(0, selectionStart || 0).split("\n");
					if (lines.length > 1) return;
				}
				if (key === "ArrowDown") {
					const lines = value.substring(selectionEnd || 0).split("\n");
					if (lines.length > 1) return;
				}
			}
		} else if (target.getAttribute("aria-expanded") === "true") {
			// Don't intercept if a dropdown/select is open and focused
			return;
		}

		const cell = target.closest("td");
		if (!cell) return;

		const row = parseInt(cell.getAttribute("data-row") || "-1", 10);
		const col = parseInt(cell.getAttribute("data-col") || "-1", 10);
		if (row === -1 || col === -1) return;

		let nextRow = row;
		let nextCol = col;

		if (key === "ArrowUp") nextRow--;
		else if (key === "ArrowDown") nextRow++;
		else if (key === "ArrowLeft") nextCol--;
		else if (key === "ArrowRight") nextCol++;

		// If we've reached this point, we are handling the navigation
		const findAndFocus = (r: number, c: number, direction: string) => {
			const table = tableRef.current;
			if (!table) return;
			if (r < 0 || r > filteredClients.length - 1) return;

			const targetCell = table.querySelector(
				`td[data-row="${r}"][data-col="${c}"]`,
			);
			if (!targetCell) {
				if (direction === "ArrowLeft" && c > 0)
					return findAndFocus(r, c - 1, direction);
				if (direction === "ArrowRight" && c < 12)
					return findAndFocus(r, c + 1, direction);
				if (direction === "ArrowUp" || direction === "ArrowDown") {
					// The row isn't mounted (virtualized out) - scroll it into
					// view and focus it once it mounts, see the effect above.
					pendingFocusRef.current = { row: r, col: c, direction };
					rowVirtualizer.scrollToIndex(r, { align: "auto" });
				}
				return;
			}

			const focusable = targetCell.querySelector(
				"input, textarea, button, [tabindex='0']",
			) as HTMLElement;

			if (focusable) {
				e.preventDefault();
				e.stopPropagation();
				focusable.focus();
				if (
					focusable instanceof HTMLInputElement ||
					focusable instanceof HTMLTextAreaElement
				) {
					focusable.select();
				}
				pendingFocusRef.current = null;
			} else {
				if (direction === "ArrowLeft" && c > 0)
					return findAndFocus(r, c - 1, direction);
				if (direction === "ArrowRight" && c < 12)
					return findAndFocus(r, c + 1, direction);
				if (direction === "ArrowUp" && r > 0)
					return findAndFocus(r - 1, c, direction);
				if (direction === "ArrowDown" && r < filteredClients.length - 1)
					return findAndFocus(r + 1, c, direction);
			}
		};

		findAndFocus(nextRow, nextCol, key);
	};

	if (!isInitialized) {
		return <SchedulingTableSkeleton />;
	}

	const columns: {
		key: string;
		label: string;
		noFilter?: boolean;
		filterKey?: string;
		filterLabel?: string;
	}[] = [
		{
			key: "fullName",
			label: "Name",
			filterKey: "color",
			filterLabel: "Color",
		},
		{ key: "evaluator", label: "Evaluator" },
		{ key: "notes", label: "Notes", noFilter: true },
		{ key: "date", label: "Date" },
		{ key: "time", label: "Time" },
		{ key: "asdAdhd", label: "ASD/ADHD" },
		{
			key: "insurance",
			label: "Insurance",
			filterKey: "insuranceNames",
			filterLabel: "Insurance",
		},
		{ key: "code", label: "Code" },
		{ key: "location", label: "Location" },
		{ key: "district", label: "District" },
		{ key: "paDate", label: "PA Date" },
		{ key: "age", label: "Age" },
	];

	return (
		<>
			<RowCountDisplay
				filteredCount={filteredClients.length}
				totalCount={deferredClients.length}
			/>
			<Table
				className={cn("min-w-max", isStale && "opacity-60 transition-opacity")}
				classNameWrapper={cn(
					"min-h-0 flex-1",
					isScrolledLeft && "scrolled-left",
					isScrolledTop && "scrolled-top",
				)}
				ref={tableRef}
			>
				<TableHeader className="sticky top-0 z-20 bg-background">
					<TableRow
						className={cn(
							"transition-shadow duration-200 hover:bg-inherit",
							isScrolledTop && "shadow-lg",
						)}
					>
						{columns.map((col, index) => {
							const filterKey = col.filterKey ?? col.key;
							const isAge = filterKey === "age";
							const options = isAge
								? ageOptions
								: (columnOptions[filterKey] ?? []);
							const counts = isAge ? undefined : columnCounts[filterKey];
							return (
								<TableHead
									className={cn(
										index === 0 &&
											"sticky left-0 z-30 bg-background transition-shadow duration-200",
										index === 0 && isScrolledLeft && "shadow-lg",
									)}
									key={col.key}
								>
									<div className="flex items-center gap-1">
										{col.label}
										{!col.noFilter && (
											<ColumnFilter
												columnName={col.filterLabel ?? col.label}
												counts={counts}
												onFilterChange={(values) =>
													handleFilterChange(filterKey, values)
												}
												options={toFilterOptions(options)}
												selectedValues={filters[filterKey] || []}
											/>
										)}
									</div>
								</TableHead>
							);
						})}
						<TableHead>Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody onKeyDownCapture={handleKeyDown}>
					{paddingTop > 0 && (
						<tr>
							<td colSpan={columns.length + 1} style={{ height: paddingTop }} />
						</tr>
					)}
					{virtualRows.map((virtualRow) => {
						const scheduledClient = filteredClients[virtualRow.index];
						if (!scheduledClient) return null;
						const rowIndex = virtualRow.index;
						return (
							<SchedulingTableRow
								actionIcon={actionIcon}
								actionVariant={actionVariant}
								districts={districts}
								downNeighborId={filteredClients[rowIndex + 1]?.clientId}
								evaluators={sortedEvaluators}
								insurances={insurances}
								isActionPending={isActionPending}
								isEditable={isEditable}
								isScrolledLeft={isScrolledLeft}
								key={scheduledClient.clientId}
								measureElement={rowVirtualizer.measureElement}
								offices={offices}
								onAction={onAction}
								onMove={onMove}
								onUpdate={onUpdate}
								rowIndex={rowIndex}
								scheduledClient={scheduledClient}
								upNeighborId={filteredClients[rowIndex - 1]?.clientId}
							/>
						);
					})}
					{paddingBottom > 0 && (
						<tr>
							<td
								colSpan={columns.length + 1}
								style={{ height: paddingBottom }}
							/>
						</tr>
					)}
				</TableBody>
			</Table>
		</>
	);
}

// Filter keys the server can filter/group on directly. "age" is intentionally
// excluded - see the comment on ageOptions in InternalSchedulingTable.
const SERVER_FILTER_KEYS = [
	"color",
	"evaluator",
	"date",
	"time",
	"asdAdhd",
	"insuranceNames",
	"code",
	"location",
	"district",
	"paDate",
] as const;

function SchedulingTableView({
	type,
	lastAddedClientId,
	onScrollToClient,
}: {
	type: "active" | "archived";
	lastAddedClientId?: number | null;
	onScrollToClient?: () => void;
}) {
	const utils = api.useUtils();
	const { filters, handleFilterChange, isInitialized } =
		useSchedulingFilterState(type);

	const queryFilters = useMemo(() => {
		const result: Partial<
			Record<(typeof SERVER_FILTER_KEYS)[number], string[]>
		> = {};
		for (const key of SERVER_FILTER_KEYS) {
			if (filters[key]?.length) result[key] = filters[key];
		}
		return result;
	}, [filters]);

	const activeQuery = api.scheduling.get.useQuery(queryFilters, {
		enabled: type === "active",
		placeholderData: keepPreviousData,
	});
	const archivedQuery = api.scheduling.getArchived.useQuery(queryFilters, {
		enabled: type === "archived",
		placeholderData: keepPreviousData,
	});

	const { data, isLoading, error } =
		type === "active" ? activeQuery : archivedQuery;

	const facetCountsQuery = api.scheduling.facetCounts.useQuery(
		{
			...queryFilters,
			archived: type === "archived",
		},
		{ placeholderData: keepPreviousData },
	);

	const columnOptions = useMemo(() => {
		const result: Record<string, string[]> = {};
		for (const key of SERVER_FILTER_KEYS) {
			result[key] = Object.keys(facetCountsQuery.data?.[key] ?? {}).sort();
		}
		return result;
	}, [facetCountsQuery.data]);

	const updateMutation = api.scheduling.update.useMutation({
		onMutate: async (newUpdate) => {
			await utils.scheduling.get.cancel(queryFilters);
			const previousData = utils.scheduling.get.getData(queryFilters);
			utils.scheduling.get.setData(queryFilters, (old) => {
				if (!old) return old;
				return {
					...old,
					clients: old.clients.map((c) =>
						c.clientId === newUpdate.clientId
							? {
									...c,
									evaluator:
										newUpdate.evaluatorNpi !== undefined
											? newUpdate.evaluatorNpi
											: (c.evaluator as number | null),
									date:
										newUpdate.date !== undefined
											? newUpdate.date
											: (c.date as string | null),
									time:
										newUpdate.time !== undefined
											? newUpdate.time
											: (c.time as string | null),
									office:
										newUpdate.office !== undefined
											? newUpdate.office
											: c.office || "",
									notes:
										newUpdate.notes !== undefined
											? newUpdate.notes
											: (c.notes as string | null),
									code:
										newUpdate.code !== undefined
											? newUpdate.code
											: (c.code as string | null),
									color:
										newUpdate.color !== undefined
											? newUpdate.color
											: (c.color as string | null),
									sort:
										newUpdate.sort !== undefined
											? newUpdate.sort
											: (c.sort ?? 0),
								}
							: c,
					),
				};
			});
			return { previousData };
		},
		onError: (_err, _newUpdate, context) =>
			context?.previousData &&
			utils.scheduling.get.setData(queryFilters, context.previousData),
		onSettled: () => utils.scheduling.get.invalidate(),
	});

	const moveMutation = api.scheduling.move.useMutation({
		onMutate: async (moveData) => {
			await utils.scheduling.get.cancel(queryFilters);
			const previousData = utils.scheduling.get.getData(queryFilters);
			utils.scheduling.get.setData(queryFilters, (old) => {
				if (!old) return old;
				const clients = [...old.clients];
				const index = clients.findIndex(
					(c) => c.clientId === moveData.clientId,
				);
				const neighborIndex = clients.findIndex(
					(c) => c.clientId === moveData.neighborClientId,
				);
				if (index === -1 || neighborIndex === -1) return old;

				const client = clients[index];
				const neighbor = clients[neighborIndex];
				if (!client || !neighbor) return old;

				// Swap sorts of just the two affected clients, then re-sort
				// so clients hidden by the active filters (not adjacent in
				// this unfiltered list) don't get shuffled.
				clients[index] = { ...client, sort: neighbor.sort };
				clients[neighborIndex] = { ...neighbor, sort: client.sort };
				clients.sort(
					(a, b) =>
						(a.sort ?? 0) - (b.sort ?? 0) ||
						new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
				);

				return { ...old, clients };
			});
			return { previousData };
		},
		onError: (_err, _moveData, context) =>
			context?.previousData &&
			utils.scheduling.get.setData(queryFilters, context.previousData),
		onSettled: () => utils.scheduling.get.invalidate(),
	});

	const actionMutation = (
		type === "active" ? api.scheduling.archive : api.scheduling.unarchive
	).useMutation({
		onSuccess: () => {
			utils.scheduling.get.invalidate();
			utils.scheduling.getArchived.invalidate();
		},
	});

	if (isLoading) return <SchedulingTableSkeleton />;
	if (error) return <div>Error: {error.message}</div>;

	return (
		<InternalSchedulingTable
			actionIcon={type === "active" ? <X /> : <ArchiveRestore />}
			actionVariant={type === "active" ? "destructive" : "default"}
			clients={(data?.clients || []) as ScheduledClient[]}
			columnCounts={facetCountsQuery.data ?? {}}
			columnOptions={columnOptions}
			districts={(data?.schoolDistricts as SchoolDistrict[]) || []}
			evaluators={(data?.evaluators as Evaluator[]) || []}
			filters={filters}
			handleFilterChange={handleFilterChange}
			insurances={(data?.insurances as InsuranceWithAliases[]) || []}
			isActionPending={actionMutation.isPending}
			isEditable={type === "active"}
			isFetching={
				(type === "active"
					? activeQuery.isFetching
					: archivedQuery.isFetching) || facetCountsQuery.isFetching
			}
			isInitialized={isInitialized}
			lastAddedClientId={lastAddedClientId}
			offices={(data?.offices as Office[]) || []}
			onAction={(clientId) => actionMutation.mutate({ clientId })}
			onMove={(clientId, neighborClientId) =>
				moveMutation.mutate({ clientId, neighborClientId })
			}
			onScrollToClient={onScrollToClient}
			onUpdate={
				type === "active"
					? (clientId, updateData) =>
							updateMutation.mutate({ clientId, ...updateData })
					: undefined
			}
			type={type}
		/>
	);
}

export function SchedulingTable({
	lastAddedClientId,
	onScrollToClient,
}: {
	lastAddedClientId?: number | null;
	onScrollToClient?: () => void;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const activeTab = searchParams.get("tab") ?? "active";

	const handleTabChange = (value: string) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("tab", value);
		router.push(`${pathname}?${params.toString()}`);
	};

	return (
		<Tabs
			className="flex h-full flex-col"
			onValueChange={handleTabChange}
			value={activeTab}
		>
			<TabsList className="shrink-0">
				<TabsTrigger value="active">Active</TabsTrigger>
				<TabsTrigger value="archived">Archived</TabsTrigger>
			</TabsList>
			<TabsContent
				className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
				value="active"
			>
				<SchedulingTableView
					lastAddedClientId={lastAddedClientId}
					onScrollToClient={onScrollToClient}
					type="active"
				/>
			</TabsContent>
			<TabsContent
				className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
				value="archived"
			>
				<SchedulingTableView
					lastAddedClientId={lastAddedClientId}
					onScrollToClient={onScrollToClient}
					type="archived"
				/>
			</TabsContent>
		</Tabs>
	);
}

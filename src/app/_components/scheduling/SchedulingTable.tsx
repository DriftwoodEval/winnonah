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
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@components/ui/tooltip";
import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DraggableAttributes,
	type DraggableSyntheticListeners,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { keepPreviousData } from "@tanstack/react-query";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { Skeleton } from "@ui/skeleton";
import { debounce } from "es-toolkit/function";
import {
	ArchiveRestore,
	ChevronDown,
	ChevronUp,
	Circle,
	GripVertical,
	Loader2,
	Search,
	X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
	memo,
	type RefObject,
	useCallback,
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
import { Redact } from "../redaction/Redact";
import { useRedaction } from "../redaction/redaction";

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

// dnd-kit's useSensor/useSensors memoize on this object's *reference*, not
// its contents - passed as a fresh literal on every render, they'd produce a
// new sensors array every render, which cascades into dnd-kit's internal
// sensor/listener context recomputing on every render too. Every mounted
// row's drag-handle listeners come from that context, so an unstable
// reference here was silently defeating SchedulingRowCells' memoization on
// every render of InternalSchedulingTable (e.g. every scroll event) -
// forcing every row's Select/Radix component trees to fully re-render
// continuously while scrolling, which is what actually drove the page to a
// crawl (and crash) during autoscroll.
const POINTER_SENSOR_OPTIONS = { activationConstraint: { distance: 4 } };

// --- Internal Hooks ---

// Rows are virtualized, so their pixel height is only an estimate until they
// actually mount and get measured, and most rows above a restored position
// never mount at all (they're outside the jump target's overscan window).
// Saving/restoring a raw scrollTop pixel value drifts by the accumulated
// estimate error across every one of those unmeasured rows, so instead we
// save the index of the topmost visible row (plus its pixel offset within
// the viewport) and restore via the virtualizer's own scrollToIndex, paired
// with a running average of real row heights (see avgRowHeightRef in the
// component below) so the estimate for unmeasured rows stays close to true.
function useTableScroll(
	tableRef: RefObject<HTMLDivElement | null>,
	storageKey: string | undefined,
	isReady: boolean | undefined,
	rowVirtualizer: Virtualizer<HTMLDivElement, Element>,
) {
	const [isScrolledLeft, setIsScrolledLeft] = useState(false);
	const [isScrolledTop, setIsScrolledTop] = useState(false);
	const hasRestoredRef = useRef(false);

	useEffect(() => {
		const table = tableRef.current;
		if (!table || !isReady) return;

		if (storageKey && !hasRestoredRef.current) {
			hasRestoredRef.current = true;
			const saved = sessionStorage.getItem(storageKey);
			if (saved) {
				const { left, index, offset } = JSON.parse(saved) as {
					left: number;
					index?: number;
					offset?: number;
				};
				table.scrollLeft = left;
				if (typeof index === "number") {
					rowVirtualizer.scrollToIndex(index, { align: "start" });
					// The first jump only has the running-average estimate to go
					// on. Once it renders, the target row and its overscan
					// neighbors get measured with real heights, so re-issuing
					// scrollToIndex on the next frame corrects for whatever the
					// estimate got wrong right around the target.
					requestAnimationFrame(() => {
						rowVirtualizer.scrollToIndex(index, { align: "start" });
						// scrollToIndex lands the row's top at the viewport top;
						// nudge back by however far into the viewport it actually
						// was so the restore isn't always pinned to "start".
						requestAnimationFrame(() => {
							table.scrollTop += offset ?? 0;
						});
					});
				}
			}
		}

		// Persisting scroll position only needs to reflect where scrolling
		// settles, not every intermediate pixel - writing to sessionStorage on
		// every single scroll event (dnd-kit's autoscroll alone can fire this
		// well over 60 times a second) competes with the same main thread
		// driving the scroll itself, which showed up as jittery, throttled
		// autoscrolling.
		const debouncedSaveScroll = debounce(() => {
			if (!storageKey) return;
			const firstVirtualRow = rowVirtualizer.getVirtualItems()[0];
			sessionStorage.setItem(
				storageKey,
				JSON.stringify({
					left: table.scrollLeft,
					index: firstVirtualRow?.index ?? 0,
					offset: firstVirtualRow ? table.scrollTop - firstVirtualRow.start : 0,
				}),
			);
		}, 200);

		const handleScroll = () => {
			setIsScrolledLeft(table.scrollLeft > 0);
			setIsScrolledTop(table.scrollTop > 0);
			debouncedSaveScroll();
		};

		handleScroll();

		table.addEventListener("scroll", handleScroll);
		return () => {
			table.removeEventListener("scroll", handleScroll);
			debouncedSaveScroll.cancel();
		};
	}, [tableRef, storageKey, isReady, rowVirtualizer]);

	return { isScrolledLeft, isScrolledTop };
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

function SchedulingSearchBox({
	value,
	onChange,
	matchCount,
	matchIndex,
	minLength,
	isPending,
	onNext,
	onPrev,
	inputRef,
}: {
	value: string;
	onChange: (value: string) => void;
	matchCount: number;
	matchIndex: number;
	minLength: number;
	isPending: boolean;
	onNext: () => void;
	onPrev: () => void;
	inputRef: React.RefObject<HTMLInputElement | null>;
}) {
	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Escape") {
			e.currentTarget.blur();
			return;
		}
		if (e.key !== "Enter") return;
		e.preventDefault();
		if (e.shiftKey) {
			onPrev();
		} else {
			onNext();
		}
	};

	const isTooShort = value.trim().length > 0 && value.trim().length < minLength;

	return (
		<div className="flex items-center gap-1 px-4 py-2">
			<Search className="size-4 text-muted-foreground" />
			<Tooltip>
				<TooltipTrigger asChild>
					<Input
						className="h-7 w-48"
						onChange={(e) => onChange(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Find client... (ctrl+f)"
						ref={inputRef}
						value={value}
					/>
				</TooltipTrigger>
				<TooltipContent>
					Enter for next match, Shift+Enter for previous
				</TooltipContent>
			</Tooltip>
			{value && (
				<>
					<span className="whitespace-nowrap text-muted-foreground text-sm">
						{isTooShort
							? `${minLength}+ chars`
							: isPending
								? "Searching…"
								: matchCount > 0
									? `${matchIndex + 1} of ${matchCount}`
									: "No matches"}
					</span>
					<Button
						disabled={matchCount === 0 || isPending}
						onClick={onPrev}
						size="icon-sm"
						variant="ghost"
					>
						<ChevronUp className="size-4" />
					</Button>
					<Button
						disabled={matchCount === 0 || isPending}
						onClick={onNext}
						size="icon-sm"
						variant="ghost"
					>
						<ChevronDown className="size-4" />
					</Button>
					<Button onClick={() => onChange("")} size="icon-sm" variant="ghost">
						<X className="size-4" />
					</Button>
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

// The dnd-kit sortable machinery re-renders every mounted row's useSortable()
// whenever ANY row mounts or unmounts (each registration dispatches through
// DndContext's reducer, producing a new context value for all consumers) -
// which happens continuously in this virtualized table as rows scroll in and
// out. Splitting the actual cell content into its own memoized component
// means that churn only re-executes the thin wrapper below, not the heavy
// Select/Textarea/EvaluatorSelect content, as long as this component's own
// props haven't changed.
const SchedulingRowCells = memo(function SchedulingRowCells({
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
	isHighlighted,
	isScrolledLeft,
	rowIndex,
	backgroundColor,
	dragHandleAttributes,
	dragHandleListeners,
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
	isHighlighted?: boolean;
	isScrolledLeft?: boolean;
	rowIndex: number;
	backgroundColor: string;
	dragHandleAttributes: DraggableAttributes;
	dragHandleListeners: DraggableSyntheticListeners;
}) {
	const [localDate, setLocalDate] = useState(scheduledClient.date ?? "");
	const [localTime, setLocalTime] = useState(scheduledClient.time ?? "");
	const [localNotes, setLocalNotes] = useState(scheduledClient.notes ?? "");
	const { enabled: redactionEnabled } = useRedaction();

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

	return (
		<>
			<TableCell
				className={cn(
					"sticky left-0 z-10 bg-background transition-shadow duration-200",
					"max-w-[200px]",
					isScrolledLeft && "shadow-lg",
					isHighlighted && "ring-2 ring-primary ring-inset",
				)}
				data-col={0}
				data-row={rowIndex}
				style={{ backgroundColor }}
			>
				<div className="flex items-center gap-2 overflow-hidden">
					{isEditable && (
						<button
							aria-label="Drag to reorder"
							className="cursor-grab touch-none rounded-sm p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-primary active:cursor-grabbing"
							type="button"
							{...dragHandleAttributes}
							{...dragHandleListeners}
						>
							<GripVertical className="h-4 w-4" />
						</button>
					)}
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
						title={
							redactionEnabled ? undefined : scheduledClient.client.fullName
						}
					>
						<Redact>{scheduledClient.client.fullName}</Redact>
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
		</>
	);
});

// Thin wrapper that owns the sortable subscription. Keeping this separate
// from SchedulingRowCells means dnd-kit's per-row re-render churn (see
// comment above SchedulingRowCells) only re-executes this small component,
// not the actual form controls.
type SchedulingRowCellsProps = Parameters<typeof SchedulingRowCells>[0];

const SchedulingTableRow = memo(function SchedulingTableRow(
	props: Omit<
		SchedulingRowCellsProps,
		"backgroundColor" | "dragHandleAttributes" | "dragHandleListeners"
	> & {
		measureElement: (el: Element | null) => void;
	},
) {
	const { scheduledClient, rowIndex, measureElement } = props;

	// The live transform tracking during an active drag already shows rows
	// sliding to make room in real time, so once the drop lands the row
	// should just settle at its new slot, not replay a second "layout
	// change" animation - dnd-kit's default for that animates the
	// just-dropped item FROM its pre-drag rect (since a CSS transform,
	// unlike a real layout move, doesn't update the tracked rect), which is
	// exactly what looked like sliding back to where it started.
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		animateLayoutChanges: () => false,
		id: scheduledClient.clientId,
	});
	const setRowRef = useCallback(
		(el: HTMLTableRowElement | null) => {
			measureElement(el);
			setNodeRef(el);
		},
		[measureElement, setNodeRef],
	);

	const color =
		scheduledClient.color && isSchedulingColor(scheduledClient.color)
			? (scheduledClient.color as SchedulingColor)
			: undefined;
	const backgroundColor = color
		? `color-mix(in srgb, ${SCHEDULING_COLOR_MAP[color]}, var(--background) 90%)`
		: "var(--background)";

	return (
		<TableRow
			className={cn("hover:bg-inherit", isDragging && "z-10 shadow-lg")}
			data-client-id={scheduledClient.clientId}
			data-index={rowIndex}
			key={scheduledClient.clientId}
			ref={setRowRef}
			style={{
				backgroundColor,
				transform: CSS.Transform.toString(transform),
				// The dragged row itself must track the cursor 1:1, not ease
				// toward it - applying the transition here is what causes a
				// drag to visibly "stick" for a moment before catching up.
				transition: isDragging ? undefined : transition,
				opacity: isDragging ? 0.6 : undefined,
			}}
		>
			<SchedulingRowCells
				{...props}
				backgroundColor={backgroundColor}
				dragHandleAttributes={attributes}
				dragHandleListeners={listeners}
			/>
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
	onReorder?: (clientId: number, overClientId: number) => void;
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
	onReorder,
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
	const tableRef = useRef<HTMLDivElement>(null);

	const dndSensors = useSensors(
		useSensor(PointerSensor, POINTER_SENSOR_OPTIONS),
	);
	const handleDragEnd = useCallback(
		({ active, over }: DragEndEvent) => {
			if (!over || active.id === over.id) return;
			onReorder?.(active.id as number, over.id as number);
		},
		[onReorder],
	);

	// isFetching alone covers the network round-trip after a filter change
	// (placeholderData keeps the old rows visible while it's in flight).
	// clients isn't deferred here - a deferred commit lagged one render
	// behind a drag reorder's synchronous cache update, showing the
	// pre-drop order for a moment before catching up. Virtualization already
	// bounds the actual DOM mount cost to the visible window regardless of
	// how many total rows a filter change adds, so deferring this array
	// bought little and cost that extra lag.
	const isStale = isFetching;

	// Age is filtered client-side over the already server-filtered `clients`,
	// mirroring how the client directory keeps its Google-Sheets-derived
	// DA/EVAL Qs filters client-side instead of pushing them into SQL.
	const ageOptions = useMemo(() => {
		const set = new Set<string>();
		for (const c of clients) {
			if (c.client.dob) set.add(formatClientAge(c.client.dob, "short"));
		}
		return Array.from(set).sort();
	}, [clients]);

	const filteredClients = useMemo(() => {
		const ageFilter = filters.age;
		if (!ageFilter?.length) return clients;
		return clients.filter((c) => {
			const age = c.client.dob ? formatClientAge(c.client.dob, "short") : "";
			return ageFilter.includes(age);
		});
	}, [clients, filters.age]);

	// SortableContext rebuilds its context value (and re-renders every mounted
	// row) whenever this array's reference changes, so it must stay stable
	// across renders that don't actually reorder/filter clients (typing,
	// scrolling, search) rather than being a fresh `.map()` inline in JSX.
	const sortableIds = useMemo(
		() => filteredClients.map((c) => c.clientId),
		[filteredClients],
	);

	// Sorted once here instead of per-row: EvaluatorSelect used to re-sort the
	// full evaluator list on every row's first render, even for rows whose
	// dropdown was never opened.
	const sortedEvaluators = useMemo(
		() =>
			evaluators.toSorted((a, b) =>
				a.providerName.localeCompare(b.providerName),
			),
		[evaluators],
	);

	// scrollToIndex (see useTableScroll) computes a target row's offset from
	// the estimated size of every unmeasured row before it, most of which
	// never mount (they're outside the jump target's overscan window) and so
	// never get a real measurement. A flat 45px guess drifts further off the
	// more rows sit between the top of the list and the restored position, so
	// we track a running average of real row heights across the session and
	// use that as the estimate instead, which keeps restores close regardless
	// of how far down the list they land.
	const avgRowHeightKey = `scheduling-row-height-${type}`;
	const avgRowHeightRef = useRef<number | null>(null);
	if (avgRowHeightRef.current === null) {
		const saved =
			typeof window !== "undefined"
				? sessionStorage.getItem(avgRowHeightKey)
				: null;
		avgRowHeightRef.current = saved ? Number(saved) : 45;
	}

	// Only mounts the rows actually in (or near) the viewport, instead of every
	// row in the filtered set - hundreds of rows each with several form
	// controls is real, otherwise-unavoidable mount cost every time the
	// filtered set changes.
	const rowVirtualizer = useVirtualizer({
		count: filteredClients.length,
		getScrollElement: () => tableRef.current,
		estimateSize: () => avgRowHeightRef.current ?? 45,
		// Higher than the plain-scrolling case needs, specifically for
		// dragging: dnd-kit continuously re-measures every mounted row while
		// a drag is active (it has to, since virtualization means most drop
		// targets aren't mounted until scrolled to), so every row that mounts
		// or unmounts mid-drag re-triggers that pass across the whole mounted
		// set. A bigger buffer means a drag can travel further via ordinary
		// mouse movement before the row set needs to change at all.
		overscan: 30,
	});
	const handleMeasureElement = useCallback(
		(el: Element | null) => {
			rowVirtualizer.measureElement(el);
			if (!el) return;
			const height = el.getBoundingClientRect().height;
			if (height <= 0) return;
			const prevAvg = avgRowHeightRef.current ?? height;
			const nextAvg = prevAvg * 0.9 + height * 0.1;
			avgRowHeightRef.current = nextAvg;
			sessionStorage.setItem(avgRowHeightKey, String(nextAvg));
		},
		[rowVirtualizer, avgRowHeightKey],
	);
	const { isScrolledLeft, isScrolledTop } = useTableScroll(
		tableRef,
		`scheduling-scroll-${type}`,
		isInitialized,
		rowVirtualizer,
	);
	const virtualRows = rowVirtualizer.getVirtualItems();
	const virtualTotalSize = rowVirtualizer.getTotalSize();
	const paddingTop = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0;
	const paddingBottom =
		virtualRows.length > 0
			? virtualTotalSize - (virtualRows.at(-1)?.end ?? 0)
			: 0;

	// Rows stay virtualized (unmounted offscreen) instead of being filtered,
	// so browser ctrl-f can't find someone who isn't in the DOM. This search
	// box scrolls matches into view instead, letting the virtualizer mount
	// them.
	const MIN_SEARCH_LENGTH = 3;

	const [searchTerm, setSearchTerm] = useState("");
	const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
	const [matchIndex, setMatchIndex] = useState(0);
	const searchInputRef = useRef<HTMLInputElement>(null);

	// Debounced so a match isn't jumped to (and the row highlighted) after
	// every keystroke - only once the user pauses, which also keeps
	// intermediate substrings like "sm" from scrolling somewhere unrelated to
	// where "smith" ends up.
	const debouncedSetSearchTerm = useCallback(
		debounce((term: string) => setDebouncedSearchTerm(term), 300),
		[],
	);

	const handleSearchChange = (value: string) => {
		setSearchTerm(value);
		if (value.trim().length < MIN_SEARCH_LENGTH) {
			debouncedSetSearchTerm.cancel();
			setDebouncedSearchTerm("");
		} else {
			debouncedSetSearchTerm(value);
		}
	};

	const isSearchPending =
		searchTerm.trim().length >= MIN_SEARCH_LENGTH &&
		searchTerm.trim().toLowerCase() !==
			debouncedSearchTerm.trim().toLowerCase();

	const searchMatches = useMemo(() => {
		const term = debouncedSearchTerm.trim().toLowerCase();
		if (term.length < MIN_SEARCH_LENGTH) return [];
		const indices: number[] = [];
		filteredClients.forEach((c, index) => {
			if (c.client.fullName.toLowerCase().includes(term)) indices.push(index);
		});
		return indices;
	}, [filteredClients, debouncedSearchTerm]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: resetting to the first match whenever the search term (or result set) changes, not on every render
	useEffect(() => {
		setMatchIndex(0);
	}, [debouncedSearchTerm, searchMatches]);

	const currentMatchClientIndex = searchMatches[matchIndex];

	// biome-ignore lint/correctness/useExhaustiveDependencies: rowVirtualizer is not a stable reference across renders and would refire this every render
	useEffect(() => {
		if (currentMatchClientIndex === undefined) return;
		rowVirtualizer.scrollToIndex(currentMatchClientIndex, {
			align: "center",
			behavior: "smooth",
		});
	}, [currentMatchClientIndex]);

	const highlightedClientId =
		filteredClients[currentMatchClientIndex ?? -1]?.clientId;

	const handleSearchNext = () => {
		if (searchMatches.length === 0) return;
		setMatchIndex((i) => (i + 1) % searchMatches.length);
	};

	const handleSearchPrev = () => {
		if (searchMatches.length === 0) return;
		setMatchIndex((i) => (i - 1 + searchMatches.length) % searchMatches.length);
	};

	// Browser ctrl-f can't find offscreen, virtualized-out rows, so this
	// search box stands in for it: ctrl/cmd-f focuses it instead of opening
	// the native find bar. Guarded by tableRef's visibility since both the
	// active and archived tab tables stay mounted (just hidden) at once.
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key.toLowerCase() !== "f" || !(e.ctrlKey || e.metaKey)) return;
			if (!tableRef.current || tableRef.current.offsetParent === null) return;
			e.preventDefault();
			searchInputRef.current?.focus();
			searchInputRef.current?.select();
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

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
			<div className="flex items-center justify-between">
				<RowCountDisplay
					filteredCount={filteredClients.length}
					totalCount={clients.length}
				/>
				<SchedulingSearchBox
					inputRef={searchInputRef}
					isPending={isSearchPending}
					matchCount={searchMatches.length}
					matchIndex={matchIndex}
					minLength={MIN_SEARCH_LENGTH}
					onChange={handleSearchChange}
					onNext={handleSearchNext}
					onPrev={handleSearchPrev}
					value={searchTerm}
				/>
			</div>
			<DndContext
				// A Chrome performance trace during the autoscroll crash
				// showed the real cause: POINTER_SENSOR_OPTIONS above was an
				// inline object literal, so dndSensors (and dnd-kit's
				// internal listener context derived from it) got a new
				// reference on every render of this component - which
				// silently defeated SchedulingRowCells' memoization on every
				// scroll event, forcing every mounted row's Select/Radix
				// component trees to fully re-render continuously. Autoscroll
				// just made that bug easy to trigger by firing scroll events
				// fastest; it wasn't the actual defect, so re-enabling it now
				// that the reference is stable.
				autoScroll={{ acceleration: 40, threshold: { x: 0.2, y: 0.3 } }}
				collisionDetection={closestCenter}
				onDragEnd={handleDragEnd}
				sensors={dndSensors}
			>
				<Table
					className={cn(
						"min-w-max",
						isStale && "opacity-60 transition-opacity",
					)}
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
								<td
									colSpan={columns.length + 1}
									style={{ height: paddingTop }}
								/>
							</tr>
						)}
						<SortableContext
							items={sortableIds}
							strategy={verticalListSortingStrategy}
						>
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
										isHighlighted={
											scheduledClient.clientId === highlightedClientId
										}
										isScrolledLeft={isScrolledLeft}
										key={scheduledClient.clientId}
										measureElement={handleMeasureElement}
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
						</SortableContext>
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
			</DndContext>
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

	const reorderMutation = api.scheduling.reorder.useMutation({
		// On success, the optimistic reorder already matches what the server
		// computed, so mark the cache stale without forcing an immediate
		// active refetch (refetchType: "none") - an active refetch flips
		// isFetching, which dims the whole table (see isStale) for a moment
		// even though nothing actually needs to change on screen. The next
		// natural refetch (refocus, remount, filter change) reconciles it
		// silently. A failed reorder rolls back via the per-call onError
		// below and does force a real refetch, to fully resync in case
		// something else changed concurrently.
		onSuccess: () =>
			utils.scheduling.get.invalidate(queryFilters, { refetchType: "none" }),
	});

	// dnd-kit's drop animation plays in the very next frame after the drag
	// ends, reading whatever order is currently rendered. react-query's
	// notifyManager schedules cache-subscriber notifications via
	// setTimeout(fn, 0) by default - a real macrotask - so even a synchronous
	// utils.scheduling.get.setData() call doesn't make useQuery's data
	// re-render until a later browser task. dnd-kit's own "drag cleared"
	// state update, by contrast, is a plain synchronous React state update
	// that paints immediately. The result was one frame with the drag
	// cleared but the OLD order still showing (a visible snap back), then a
	// frame later the reordered data finally landing. pendingReorderIds is
	// plain component state instead, updated synchronously in the same event
	// handler as dnd-kit's own update, so React batches them into a single
	// paint - no gap for the stale order to flash in.
	const [pendingReorderIds, setPendingReorderIds] = useState<number[] | null>(
		null,
	);

	// Once the query cache's real order actually matches what we rendered
	// optimistically, the override has served its purpose and can drop -
	// letting the query data (now caught up) drive rendering again.
	useEffect(() => {
		if (!pendingReorderIds || !data) return;
		const currentIds = data.clients.map((c) => c.clientId);
		const matches =
			currentIds.length === pendingReorderIds.length &&
			currentIds.every((id, i) => id === pendingReorderIds[i]);
		if (matches) setPendingReorderIds(null);
	}, [data, pendingReorderIds]);

	const orderedClients = useMemo(() => {
		const base = (data?.clients || []) as ScheduledClient[];
		if (!pendingReorderIds) return base;
		const byId = new Map(base.map((c) => [c.clientId, c]));
		const reordered = pendingReorderIds
			.map((id) => byId.get(id))
			.filter((c): c is ScheduledClient => c !== undefined);
		return reordered.length === base.length ? reordered : base;
	}, [data, pendingReorderIds]);

	const handleReorder = useCallback(
		(clientId: number, overClientId: number) => {
			const previousData = utils.scheduling.get.getData(queryFilters);
			const baseClients = previousData?.clients ?? [];
			const oldIndex = baseClients.findIndex((c) => c.clientId === clientId);
			const newIndex = baseClients.findIndex(
				(c) => c.clientId === overClientId,
			);
			if (oldIndex === -1 || newIndex === -1) return;
			const reordered = arrayMove(baseClients, oldIndex, newIndex);
			setPendingReorderIds(reordered.map((c) => c.clientId));

			// Not awaited: cancel() and setData() run back-to-back in the same
			// tick either way, and awaiting would defer setData past this task.
			utils.scheduling.get.cancel(queryFilters);
			utils.scheduling.get.setData(queryFilters, (old) =>
				old ? { ...old, clients: reordered } : old,
			);
			reorderMutation.mutate(
				{ clientId, overClientId },
				{
					onError: () => {
						setPendingReorderIds(null);
						if (previousData) {
							utils.scheduling.get.setData(queryFilters, previousData);
						}
						utils.scheduling.get.invalidate(queryFilters);
					},
				},
			);
		},
		[utils, queryFilters, reorderMutation],
	);

	const actionMutation = (
		type === "active" ? api.scheduling.archive : api.scheduling.unarchive
	).useMutation({
		onSuccess: () => {
			utils.scheduling.get.invalidate();
			utils.scheduling.getArchived.invalidate();
		},
	});

	// Inline arrow functions here would be a fresh reference every render of
	// this component (which happens often - query refetches, isFetching
	// toggling, every reorder step) and, passed straight through
	// InternalSchedulingTable to every row, would defeat SchedulingRowCells'
	// memoization exactly like the dnd-kit sensors reference did (see
	// POINTER_SENSOR_OPTIONS above).
	const handleAction = useCallback(
		(clientId: number) => actionMutation.mutate({ clientId }),
		[actionMutation.mutate],
	);
	const handleMove = useCallback(
		(clientId: number, neighborClientId: number) =>
			moveMutation.mutate({ clientId, neighborClientId }),
		[moveMutation.mutate],
	);
	const handleUpdate = useCallback(
		(clientId: number, updateData: SchedulingUpdateData) =>
			updateMutation.mutate({ clientId, ...updateData }),
		[updateMutation.mutate],
	);

	if (isLoading) return <SchedulingTableSkeleton />;
	if (error) return <div>Error: {error.message}</div>;

	return (
		<InternalSchedulingTable
			actionIcon={type === "active" ? <X /> : <ArchiveRestore />}
			actionVariant={type === "active" ? "destructive" : "default"}
			clients={orderedClients}
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
			onAction={handleAction}
			onMove={handleMove}
			onReorder={handleReorder}
			onScrollToClient={onScrollToClient}
			onUpdate={type === "active" ? handleUpdate : undefined}
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

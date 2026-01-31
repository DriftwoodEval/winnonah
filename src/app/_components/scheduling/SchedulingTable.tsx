"use client";

import { Badge } from "@components/ui/badge";
import { Button } from "@components/ui/button";
import { Checkbox } from "@components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
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
import { Skeleton } from "@ui/skeleton";
import { ArchiveRestore, Circle, Filter, Loader2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
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
}

const normalize = (val: string | null | undefined) => {
	if (!val || val === "-") return "";
	return val;
};

function getScheduledClientDisplayValues(
	client: ScheduledClient,
	evaluators: Map<number, Evaluator>,
	offices: Map<string, Office>,
	districts: Map<string, SchoolDistrict>,
	insurances: InsuranceWithAliases[],
) {
	const evaluator = client.evaluator
		? evaluators.get(client.evaluator as number)
		: null;
	const office = client.office ? offices.get(client.office as string) : null;
	const district = client.client.schoolDistrict
		? districts.get(client.client.schoolDistrict)
		: null;

	const insurance = mapInsuranceToShortNames(
		client.client.primaryInsurance,
		client.client.secondaryInsurance,
		insurances,
	);

	return {
		color: normalize(client.color),
		fullName: normalize(client.client.fullName),
		evaluator: normalize(evaluator?.providerName.split(" ")[0]),
		date: normalize(client.date),
		time: normalize(client.time),
		asdAdhd: normalize(client.client.asdAdhd),
		insurance: normalize(insurance),
		code: normalize(client.code),
		location: normalize(
			client.office === "Virtual" ? "Virtual" : office?.prettyName || "",
		),
		district: normalize(
			district?.shortName ||
				client.client.schoolDistrict?.replace(/ (County )?School District/, ""),
		),
		paDate: normalize(
			client.client.precertExpires
				? getLocalDayFromUTCDate(
						client.client.precertExpires,
					)?.toLocaleDateString() || ""
				: "",
		),
		age: normalize(
			client.client.dob ? formatClientAge(client.client.dob, "short") : "",
		),
		notes: normalize(client.notes),
	};
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

function useSchedulingFilters(
	type: "active" | "archived",
	clients: ScheduledClient[],
	evaluators: Evaluator[],
	offices: Office[],
	districts: SchoolDistrict[],
	insurances: InsuranceWithAliases[],
) {
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

	const evaluatorMap = useMemo(
		() => new Map(evaluators.map((e) => [e.npi, e])),
		[evaluators],
	);
	const officeMap = useMemo(
		() => new Map(offices.map((o) => [o.key, o])),
		[offices],
	);
	const districtMap = useMemo(
		() => new Map(districts.map((d) => [d.fullName, d])),
		[districts],
	);

	const clientDisplayValues = useMemo(() => {
		return clients.map((client) => ({
			client,
			displayValues: getScheduledClientDisplayValues(
				client,
				evaluatorMap,
				officeMap,
				districtMap,
				insurances,
			),
		}));
	}, [clients, evaluatorMap, officeMap, districtMap, insurances]);

	const uniqueValues = useMemo(() => {
		const values: Record<string, Set<string>> = {
			color: new Set(),
			fullName: new Set(),
			evaluator: new Set(),
			date: new Set(),
			time: new Set(),
			asdAdhd: new Set(),
			insurance: new Set(),
			code: new Set(),
			location: new Set(),
			district: new Set(),
			paDate: new Set(),
			age: new Set(),
			notes: new Set(),
		};

		for (const { displayValues } of clientDisplayValues) {
			for (const key in values) {
				const val = displayValues[key as keyof typeof displayValues];
				if (val !== undefined) {
					values[key]?.add(val);
				}
			}
		}

		const result: Record<string, string[]> = {};
		for (const key in values) {
			result[key] = Array.from(values[key] || [])
				.filter((v) => v !== undefined)
				.sort();
		}
		return result;
	}, [clientDisplayValues]);

	const filteredClients = useMemo(() => {
		return clientDisplayValues
			.filter(({ displayValues }) => {
				return Object.entries(filters).every(([key, selectedValues]) => {
					if (!selectedValues || selectedValues.length === 0) return true;
					const value = displayValues[key as keyof typeof displayValues];
					return selectedValues.includes(value || "");
				});
			})
			.map(({ client }) => client);
	}, [clientDisplayValues, filters]);

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

	return {
		filteredClients,
		filters,
		handleFilterChange,
		uniqueValues,
		clientDisplayValues,
		isInitialized,
	};
}

// --- UI Components ---

function ColumnFilter({
	columnName,
	options,
	selectedValues,
	onFilterChange,
	optionCounts,
}: {
	columnName: string;
	options: string[];
	selectedValues: string[];
	onFilterChange: (values: string[]) => void;
	optionCounts?: Map<string, number>;
}) {
	const [search, setSearch] = useState("");

	const filteredOptions = useMemo(() => {
		return options
			.filter((option) => option.toLowerCase().includes(search.toLowerCase()))
			.sort((a, b) => a.localeCompare(b));
	}, [options, search]);

	const toggleValue = (value: string) => {
		const newValues = selectedValues.includes(value)
			? selectedValues.filter((v) => v !== value)
			: [...selectedValues, value];
		onFilterChange(newValues);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<div className="relative inline-block">
					<Button
						className={
							selectedValues.length > 0
								? "text-primary"
								: "text-muted-foreground"
						}
						size="icon-sm"
						variant="ghost"
					>
						<Filter className="h-3.5 w-3.5" />
					</Button>
					{selectedValues.length > 0 && (
						<Badge
							className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] leading-none"
							variant="default"
						>
							{selectedValues.length}
						</Badge>
					)}
				</div>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				<div className="p-2">
					<Input
						className="mb-2 h-8"
						onChange={(e) => setSearch(e.target.value)}
						placeholder={`Search ${columnName}...`}
						value={search}
					/>
					<div className="max-h-60 overflow-y-auto">
						{filteredOptions.length === 0 && (
							<div className="p-2 text-muted-foreground text-sm">
								No results found
							</div>
						)}
						{filteredOptions.map((option) => {
							const count = optionCounts?.get(option) ?? 0;
							return (
								<div
									className="flex items-center space-x-2 p-1"
									key={option || "empty"}
								>
									<Checkbox
										checked={selectedValues.includes(option)}
										id={`${columnName}-${option}`}
										onCheckedChange={() => toggleValue(option)}
									/>
									<label
										className="flex flex-1 cursor-pointer items-center justify-between gap-2 font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
										htmlFor={`${columnName}-${option}`}
									>
										<span className="truncate">{option || "(Empty)"}</span>
										{optionCounts && (
											<span className="text-muted-foreground text-xs">
												{count}
											</span>
										)}
									</label>
								</div>
							);
						})}
					</div>
				</div>
				{selectedValues.length > 0 && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="justify-center text-destructive"
							onClick={() => onFilterChange([])}
						>
							Clear Filter
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
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
				<Button size="icon-sm" variant="ghost">
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
					key="no-color"
					onClick={() => onChange(null)}
					onSelect={() => onChange(null)}
				>
					No Color
				</DropdownMenuItem>
				{SCHEDULING_COLOR_KEYS.sort((a, b) => a.localeCompare(b)).map(
					(color) => (
						<DropdownMenuItem
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
		if (!eligibleEvaluators || eligibleEvaluators.length === 0) {
			return { eligible: [], other: allEvaluators };
		}
		const eligibleNpis = new Set(eligibleEvaluators.map((e) => e.npi));
		const eligible = allEvaluators
			.filter((e) => eligibleNpis.has(e.npi))
			.sort((a, b) => a.providerName.localeCompare(b.providerName));
		const other = allEvaluators
			.filter((e) => !eligibleNpis.has(e.npi))
			.sort((a, b) => a.providerName.localeCompare(b.providerName));
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
	insurances,
	isEditable,
	onUpdate,
	actions,
	isScrolledLeft,
	rowIndex,
}: {
	scheduledClient: ScheduledClient;
	evaluators: Evaluator[];
	offices: Office[];
	insurances: InsuranceWithAliases[];
	isEditable?: boolean;
	onUpdate?: (clientId: number, data: SchedulingUpdateData) => void;
	actions: React.ReactNode;
	isScrolledLeft?: boolean;
	rowIndex: number;
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
			key={scheduledClient.clientId}
			style={{ backgroundColor }}
		>
			<TableCell
				className={cn(
					"sticky left-0 z-10 bg-background transition-shadow duration-200",
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
				<div className="flex items-center gap-2">
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
						className="hover:underline"
						href={`/clients/${scheduledClient.client.hash}`}
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
					<div className="max-h-[2.5rem] overflow-hidden overscroll-auto text-sm">
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
							<SelectValue placeholder="Select Office" />
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
				) : (
					scheduledClient.office || "-"
				)}
			</TableCell>

			<TableCell data-col={9} data-row={rowIndex}>
				{scheduledClient.client.schoolDistrict?.replace(
					/ (County )?School District/,
					"",
				) || "-"}
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
				{actions}
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
	onAction: (clientId: number) => void;
	actionIcon: React.ReactNode;
	actionVariant: "default" | "destructive";
	isActionPending: boolean;
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
	onAction,
	actionIcon,
	actionVariant,
	isActionPending,
}: InternalSchedulingTableProps) {
	const {
		filteredClients,
		filters,
		handleFilterChange,
		uniqueValues,
		clientDisplayValues,
		isInitialized,
	} = useSchedulingFilters(
		type,
		clients,
		evaluators,
		offices,
		districts,
		insurances,
	);

	const { isScrolledLeft, isScrolledTop, tableRef } = useTableScroll(
		`scheduling-scroll-${type}`,
		isInitialized,
	);

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

		const row = parseInt(cell.getAttribute("data-row") || "-1");
		const col = parseInt(cell.getAttribute("data-col") || "-1");
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

			const targetCell = table.querySelector(
				`td[data-row="${r}"][data-col="${c}"]`,
			);
			if (!targetCell) {
				if (direction === "ArrowLeft" && c > 0)
					return findAndFocus(r, c - 1, direction);
				if (direction === "ArrowRight" && c < 12)
					return findAndFocus(r, c + 1, direction);
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
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-2">
				{[1, 2, 3, 4, 5].map((id) => (
					<Skeleton className="h-10 w-full" key={id} />
				))}
			</div>
		);
	}

	const getOptionCounts = (columnKey: string): Map<string, number> => {
		const counts = new Map<string, number>();
		clientDisplayValues.forEach(({ displayValues }) => {
			const value =
				displayValues[columnKey as keyof typeof displayValues] || "";
			counts.set(value, (counts.get(value) || 0) + 1);
		});
		return counts;
	};

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
		{ key: "insurance", label: "Insurance" },
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
				totalCount={clients.length}
			/>
			<Table
				className="min-w-max"
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
							const optionCounts = col.noFilter
								? undefined
								: getOptionCounts(filterKey);
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
												onFilterChange={(values) =>
													handleFilterChange(filterKey, values)
												}
												optionCounts={optionCounts}
												options={uniqueValues[filterKey] || []}
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
					{filteredClients.map((scheduledClient, rowIndex) => (
						<SchedulingTableRow
							actions={
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
							}
							evaluators={evaluators}
							insurances={insurances}
							isEditable={isEditable}
							isScrolledLeft={isScrolledLeft}
							key={scheduledClient.clientId}
							offices={offices}
							onUpdate={onUpdate}
							rowIndex={rowIndex}
							scheduledClient={scheduledClient}
						/>
					))}
				</TableBody>
			</Table>
		</>
	);
}

function SchedulingTableView({ type }: { type: "active" | "archived" }) {
	const utils = api.useUtils();

	const activeQuery = api.scheduling.get.useQuery(undefined, {
		enabled: type === "active",
	});
	const archivedQuery = api.scheduling.getArchived.useQuery(undefined, {
		enabled: type === "archived",
	});

	const { data, isLoading, error } =
		type === "active" ? activeQuery : archivedQuery;

	const updateMutation = api.scheduling.update.useMutation({
		onMutate: async (newUpdate) => {
			await utils.scheduling.get.cancel();
			const previousData = utils.scheduling.get.getData();
			utils.scheduling.get.setData(undefined, (old) => {
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
								}
							: c,
					),
				};
			});
			return { previousData };
		},
		onError: (_err, _newUpdate, context) =>
			context?.previousData &&
			utils.scheduling.get.setData(undefined, context.previousData),
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

	if (isLoading)
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-2">
				{[1, 2, 3, 4, 5].map((id) => (
					<Skeleton className="h-10 w-full" key={id} />
				))}
			</div>
		);
	if (error) return <div>Error: {error.message}</div>;

	return (
		<InternalSchedulingTable
			actionIcon={type === "active" ? <X /> : <ArchiveRestore />}
			actionVariant={type === "active" ? "destructive" : "default"}
			clients={(data?.clients || []) as ScheduledClient[]}
			districts={(data?.schoolDistricts as SchoolDistrict[]) || []}
			evaluators={(data?.evaluators as Evaluator[]) || []}
			insurances={(data?.insurances as InsuranceWithAliases[]) || []}
			isActionPending={actionMutation.isPending}
			isEditable={type === "active"}
			offices={(data?.offices as Office[]) || []}
			onAction={(clientId) => actionMutation.mutate({ clientId })}
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

export function SchedulingTable() {
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
				<SchedulingTableView type="active" />
			</TabsContent>
			<TabsContent
				className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
				value="archived"
			>
				<SchedulingTableView type="archived" />
			</TabsContent>
		</Tabs>
	);
}

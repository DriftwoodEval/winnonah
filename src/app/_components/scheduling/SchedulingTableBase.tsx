"use client";

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
import { TableCell, TableHead, TableRow } from "@components/ui/table";
import { Textarea } from "@components/ui/textarea";
import { Circle, Filter } from "lucide-react";
import Link from "next/link";
import { memo, useEffect, useMemo, useState } from "react";
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
import { Badge } from "../ui/badge";

export const normalize = (val: string | null | undefined) => {
	if (!val || val === "-") return "";
	return val;
};

export function FilterButton({
	count,
	isActive,
}: {
	count: number;
	isActive: boolean;
}) {
	return (
		<div className="relative">
			<Button
				className={cn(isActive ? "text-primary" : "text-muted-foreground")}
				size="icon-sm"
				variant="ghost"
			>
				<Filter className="h-3.5 w-3.5" />
			</Button>
			{count > 0 && (
				<Badge
					className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] leading-none"
					variant="default"
				>
					{count}
				</Badge>
			)}
		</div>
	);
}

export function getScheduledClientDisplayValues(
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

export function ColumnFilter({
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
						<span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[10px] text-primary-foreground leading-none">
							{selectedValues.length}
						</span>
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

export function RowCountDisplay({
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

export function SchedulingTableHeader({
	filters,
	onFilterChange,
	uniqueValues,
	isScrolledLeft,
	isScrolledTop,
	clientDisplayValues,
}: {
	filters: Record<string, string[]>;
	onFilterChange: (column: string, values: string[]) => void;
	uniqueValues: Record<string, string[]>;
	isScrolledLeft?: boolean;
	isScrolledTop?: boolean;
	clientDisplayValues: Array<{
		client: ScheduledClient;
		displayValues: ReturnType<typeof getScheduledClientDisplayValues>;
	}>;
}) {
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
								"sticky top-0 left-0 z-30 bg-background transition-shadow duration-200",
							index === 0 && isScrolledLeft && "shadow-lg",
						)}
						key={col.key}
					>
						<div className="flex items-center gap-1">
							{col.label}
							{!col.noFilter && (
								<ColumnFilter
									columnName={col.filterLabel ?? col.label}
									onFilterChange={(values) => onFilterChange(filterKey, values)}
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
	);
}

export function ColorPicker({
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

export function EvaluatorSelect({
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

export interface SchedulingUpdateData {
	evaluatorNpi?: number | null;
	date?: string;
	time?: string;
	office?: string;
	notes?: string;
	code?: string;
	color?: string | null;
}

export const SchedulingTableRow = memo(function SchedulingTableRow({
	scheduledClient,
	evaluators,
	offices,
	districts,
	insurances,
	isEditable,
	onUpdate,
	actions,
	isScrolledLeft,
}: {
	scheduledClient: ScheduledClient;
	evaluators: Evaluator[];
	offices: Office[];
	districts?: SchoolDistrict[];
	insurances: InsuranceWithAliases[];
	isEditable?: boolean;
	onUpdate?: (clientId: number, data: SchedulingUpdateData) => void;
	actions: React.ReactNode;
	isScrolledLeft?: boolean;
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

	const evaluatorMap = useMemo(
		() => new Map(evaluators.map((e) => [e.npi, e])),
		[evaluators],
	);
	const officeMap = useMemo(
		() => new Map(offices.map((o) => [o.key, o])),
		[offices],
	);
	const districtMap = useMemo(
		() => new Map((districts ?? []).map((d) => [d.fullName, d])),
		[districts],
	);

	const displayValues = useMemo(
		() =>
			getScheduledClientDisplayValues(
				scheduledClient,
				evaluatorMap,
				officeMap,
				districtMap,
				insurances,
			),
		[scheduledClient, evaluatorMap, officeMap, districtMap, insurances],
	);

	return (
		<TableRow
			className="hover:bg-inherit"
			key={scheduledClient.clientId}
			style={{ backgroundColor }}
		>
			<TableCell
				className={cn(
					"sticky left-0 z-5 bg-background transition-shadow duration-200",
					isScrolledLeft && "shadow-lg",
				)}
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
			<TableCell>
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

			<TableCell className="min-w-[200px] max-w-[200px]">
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
					<Textarea
						className="max-h-[2.5rem] min-h-[2.5rem] resize-none transition-all duration-200 focus:min-h-[10rem]"
						readOnly
						value={displayValues.notes}
					/>
				)}
			</TableCell>

			<TableCell className="min-w-[100px] max-w-[120px]">
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
					displayValues.date || "-"
				)}
			</TableCell>

			<TableCell className="min-w-[100px] max-w-[120px]">
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
					displayValues.time || "-"
				)}
			</TableCell>

			<TableCell>{displayValues.asdAdhd || "-"}</TableCell>

			<TableCell>{displayValues.insurance || "-"}</TableCell>

			<TableCell>
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
					displayValues.code || "-"
				)}
			</TableCell>

			<TableCell className="min-w-fit">
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
					displayValues.location || "-"
				)}
			</TableCell>

			<TableCell>{displayValues.district || "-"}</TableCell>

			<TableCell>{displayValues.paDate || "-"}</TableCell>

			<TableCell>{displayValues.age}</TableCell>

			<TableCell>{actions}</TableCell>
		</TableRow>
	);
});

"use client";

import { Button } from "@components/ui/button";
import { Checkbox } from "@components/ui/checkbox";
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
import { TableCell, TableHead, TableRow } from "@components/ui/table";
import { Textarea } from "@components/ui/textarea";
import { Circle, Filter } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
} from "~/lib/types";
import { formatClientAge, getLocalDayFromUTCDate } from "~/lib/utils";
import { api } from "~/trpc/react";

export function ColumnFilter({
	columnName,
	options,
	selectedValues,
	onFilterChange,
}: {
	columnName: string;
	options: string[];
	selectedValues: string[];
	onFilterChange: (values: string[]) => void;
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
				<Button
					className={
						selectedValues.length > 0 ? "text-primary" : "text-muted-foreground"
					}
					size="icon-sm"
					variant="ghost"
				>
					<Filter className="h-3.5 w-3.5" />
				</Button>
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
						{filteredOptions.map((option) => (
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
									className="flex-1 cursor-pointer font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
									htmlFor={`${columnName}-${option}`}
								>
									{option || "(Empty)"}
								</label>
							</div>
						))}
					</div>
				</div>
				{selectedValues.length > 0 && (
					<>
						<SelectSeparator />
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
				{SCHEDULING_COLOR_KEYS.map((color) => (
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
				))}
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
	const { data: eligibleEvaluators, isLoading } =
		api.evaluators.getEligibleForClient.useQuery(clientId, {
			enabled: !disabled,
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
		<Select onValueChange={onChange} value={value}>
			<SelectTrigger>
				<SelectValue placeholder="Evaluator" />
			</SelectTrigger>
			<SelectContent>
				{isLoading ? (
					<div className="p-2 text-muted-foreground text-sm">Loading...</div>
				) : (
					<>
						{eligible.map((evaluator) => (
							<SelectItem key={evaluator.npi} value={evaluator.npi.toString()}>
								{evaluator.providerName.split(" ")[0]}
							</SelectItem>
						))}
						{eligible.length > 0 && other.length > 0 && <SelectSeparator />}
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

export function SchedulingTableHeader({
	filters,
	onFilterChange,
	uniqueValues,
}: {
	filters: Record<string, string[]>;
	onFilterChange: (column: string, values: string[]) => void;
	uniqueValues: Record<string, string[]>;
}) {
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
		<TableRow className="hover:bg-inherit">
			{columns.map((col) => (
				<TableHead key={col.key}>
					<div className="flex items-center gap-1">
						{col.label}
						{!col.noFilter && (
							<ColumnFilter
								columnName={col.filterLabel ?? col.label}
								onFilterChange={(values) =>
									onFilterChange(col.filterKey ?? col.key, values)
								}
								options={uniqueValues[col.filterKey ?? col.key] || []}
								selectedValues={filters[col.filterKey ?? col.key] || []}
							/>
						)}
					</div>
				</TableHead>
			))}
			<TableHead>Actions</TableHead>
		</TableRow>
	);
}

export interface ScheduledClient {
	clientId: number;
	evaluator: number | null;
	date: string | null;
	time: string | null;
	office: string | null;
	notes: string | null;
	code: string | null;
	color: string | null;
	archived: boolean;
	client: {
		hash: string;
		fullName: string;
		asdAdhd: string | null;
		primaryInsurance: string | null;
		secondaryInsurance: string | null;
		schoolDistrict: string | null;
		precertExpires: Date | null;
		dob: Date | null;
	};
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

export function SchedulingTableRow({
	scheduledClient,
	evaluators,
	offices,
	districts,
	insurances,
	isEditable,
	onUpdate,
	actions,
}: {
	scheduledClient: ScheduledClient;
	evaluators: Evaluator[];
	offices: Office[];
	districts?: SchoolDistrict[];
	insurances: InsuranceWithAliases[];
	isEditable?: boolean;
	onUpdate?: (clientId: number, data: SchedulingUpdateData) => void;
	actions: React.ReactNode;
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
		? `${SCHEDULING_COLOR_MAP[color]}10`
		: "transparent";

	const office = offices.find((o) => o.key === scheduledClient.office);

	const mapInsuranceToShortNames = (
		primary: string | null,
		secondary: string | null,
		insurances: InsuranceWithAliases[],
	) => {
		const getShortName = (officialName: string | null) => {
			if (!officialName) return null;
			const insurance = insurances.find(
				(i) =>
					i.shortName === officialName ||
					i.aliases.some((a) => a.name === officialName),
			);
			return insurance?.shortName || officialName;
		};

		return [getShortName(primary), getShortName(secondary)]
			.filter(Boolean)
			.join(" | ");
	};

	return (
		<TableRow
			className="hover:bg-inherit"
			key={scheduledClient.clientId}
			style={{ backgroundColor }}
		>
			<TableCell>
				<div className="flex items-center gap-2">
					<ColorPicker
						disabled={!isEditable}
						onChange={(value) =>
							onUpdate?.(scheduledClient.clientId, { color: value })
						}
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
					onChange={(value) =>
						onUpdate?.(scheduledClient.clientId, {
							evaluatorNpi: value ? parseInt(value, 10) : null,
						})
					}
					value={scheduledClient.evaluator?.toString() ?? ""}
				/>
			</TableCell>

			<TableCell className="min-w-[200px] max-w-[200px]">
				{isEditable ? (
					<Textarea
						className="max-h-[2.5rem] min-h-[2.5rem] resize-none transition-all duration-200 focus:min-h-[10rem]"
						onBlur={() =>
							onUpdate?.(scheduledClient.clientId, {
								notes: localNotes,
							})
						}
						onChange={(e) => setLocalNotes(e.target.value)}
						value={localNotes}
					/>
				) : (
					<Textarea
						className="max-h-[2.5rem] min-h-[2.5rem] resize-none transition-all duration-200 focus:min-h-[10rem]"
						readOnly
						value={scheduledClient.notes || ""}
					/>
				)}
			</TableCell>

			<TableCell className="min-w-[100px]">
				{isEditable ? (
					<Input
						onBlur={() =>
							onUpdate?.(scheduledClient.clientId, { date: localDate })
						}
						onChange={(e) => setLocalDate(e.target.value)}
						value={localDate}
					/>
				) : (
					scheduledClient.date || "-"
				)}
			</TableCell>

			<TableCell className="min-w-[100px]">
				{isEditable ? (
					<Input
						onBlur={() =>
							onUpdate?.(scheduledClient.clientId, { time: localTime })
						}
						onChange={(e) => setLocalTime(e.target.value)}
						value={localTime}
					/>
				) : (
					scheduledClient.time || "-"
				)}
			</TableCell>

			<TableCell>{scheduledClient.client.asdAdhd ?? "-"}</TableCell>

			<TableCell>
				{mapInsuranceToShortNames(
					scheduledClient.client.primaryInsurance,
					scheduledClient.client.secondaryInsurance,
					insurances,
				) || "-"}
			</TableCell>

			<TableCell>
				{isEditable ? (
					<Select
						onValueChange={(value) => {
							const updates: SchedulingUpdateData = { code: value };
							if (value === "90791") {
								updates.office = "Virtual";
							}
							onUpdate?.(scheduledClient.clientId, updates);
						}}
						value={scheduledClient.code ?? ""}
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
					scheduledClient.code || "-"
				)}
			</TableCell>

			<TableCell className="min-w-fit">
				{isEditable ? (
					<Select
						onValueChange={(value) =>
							onUpdate?.(scheduledClient.clientId, { office: value })
						}
						value={scheduledClient.office ?? ""}
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
				) : scheduledClient.office === "Virtual" ? (
					"Virtual"
				) : (
					office?.prettyName || "-"
				)}
			</TableCell>

			<TableCell>
				{(() => {
					if (!scheduledClient.client.schoolDistrict) return "-";
					const district = districts?.find(
						(d) => d.fullName === scheduledClient.client.schoolDistrict,
					);
					return (
						district?.shortName ||
						scheduledClient.client.schoolDistrict
							?.replace(/ County School District/, "")
							.replace(/ School District/, "")
					);
				})()}
			</TableCell>

			<TableCell>
				{scheduledClient.client.precertExpires
					? getLocalDayFromUTCDate(
							scheduledClient.client.precertExpires,
						)?.toLocaleDateString("en-US", {
							month: "numeric",
							day: "numeric",
							year: "2-digit",
						})
					: "-"}
			</TableCell>

			<TableCell>
				{scheduledClient.client.dob
					? formatClientAge(scheduledClient.client.dob, "short")
					: ""}
			</TableCell>

			<TableCell>{actions}</TableCell>
		</TableRow>
	);
}

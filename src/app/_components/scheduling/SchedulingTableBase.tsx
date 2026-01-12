"use client";

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
import { TableCell, TableHead, TableRow } from "@components/ui/table";
import { Circle } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
	formatColorName,
	isSchedulingColor,
	SCHEDULING_COLOR_KEYS,
	SCHEDULING_COLOR_MAP,
	type SchedulingColor,
} from "~/lib/colors";
import type { Evaluator, Office } from "~/lib/types";
import { formatClientAge, getLocalDayFromUTCDate } from "~/lib/utils";
import { api } from "~/trpc/react";

export function ColorPicker({
	value,
	onChange,
	disabled,
}: {
	value?: SchedulingColor;
	onChange: (value: SchedulingColor) => void;
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

export function SchedulingTableHeader() {
	return (
		<TableRow className="hover:bg-inherit">
			<TableHead>Name</TableHead>
			<TableHead>Evaluator</TableHead>
			<TableHead>Date</TableHead>
			<TableHead>Time</TableHead>
			<TableHead>ASD/ADHD</TableHead>
			<TableHead>Insurance</TableHead>
			<TableHead>Code</TableHead>
			<TableHead>Location</TableHead>
			<TableHead>District</TableHead>
			<TableHead>PA Date</TableHead>
			<TableHead>Age</TableHead>
			<TableHead>Karen Notes</TableHead>
			<TableHead>Barbara Notes</TableHead>
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
	karenNotes: string | null;
	barbaraNotes: string | null;
	code: string | null;
	color: string | null;
	archived: boolean;
	client: {
		hash: string;
		fullName: string;
		asdAdhd: string | null;
		primaryInsurance: string | null;
		secondaryInsurance: string | null;
		closestOffice: string | null;
		schoolDistrict: string | null;
		precertExpires: Date | null;
		dob: Date | null;
	};
}

export function SchedulingTableRow({
	scheduledClient,
	evaluators,
	offices,
	isEditable,
	onUpdate,
	actions,
}: {
	scheduledClient: ScheduledClient;
	evaluators: Evaluator[];
	offices: Office[];
	isEditable?: boolean;
	onUpdate?: (clientId: number, data: any) => void;
	actions: React.ReactNode;
}) {
	const [localDate, setLocalDate] = useState(scheduledClient.date ?? "");
	const [localTime, setLocalTime] = useState(scheduledClient.time ?? "");
	const [localKarenNotes, setLocalKarenNotes] = useState(
		scheduledClient.karenNotes ?? "",
	);
	const [localBarbaraNotes, setLocalBarbaraNotes] = useState(
		scheduledClient.barbaraNotes ?? "",
	);

	useEffect(() => {
		setLocalDate(scheduledClient.date ?? "");
	}, [scheduledClient.date]);

	useEffect(() => {
		setLocalTime(scheduledClient.time ?? "");
	}, [scheduledClient.time]);

	useEffect(() => {
		setLocalKarenNotes(scheduledClient.karenNotes ?? "");
	}, [scheduledClient.karenNotes]);

	useEffect(() => {
		setLocalBarbaraNotes(scheduledClient.barbaraNotes ?? "");
	}, [scheduledClient.barbaraNotes]);

	const color =
		scheduledClient.color && isSchedulingColor(scheduledClient.color)
			? (scheduledClient.color as SchedulingColor)
			: undefined;

	const backgroundColor = color
		? `${SCHEDULING_COLOR_MAP[color]}10`
		: "transparent";

	const office = offices.find((o) => o.key === scheduledClient.office);

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
				{[
					scheduledClient.client.primaryInsurance,
					scheduledClient.client.secondaryInsurance,
				]
					.filter(Boolean)
					.join(" | ") || "-"}
			</TableCell>

			<TableCell>
				{isEditable ? (
					<Select
						onValueChange={(value) =>
							onUpdate?.(scheduledClient.clientId, { code: value })
						}
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
						value={
							scheduledClient.office ??
							scheduledClient.client.closestOffice ??
							""
						}
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
					office?.prettyName || scheduledClient.client.closestOffice || "-"
				)}
			</TableCell>

			<TableCell>
				{scheduledClient.client.schoolDistrict
					? scheduledClient.client.schoolDistrict
							?.replace(/ County School District$/, "")
							.replace(/ School District$/, "")
					: "-"}
			</TableCell>

			<TableCell>
				{scheduledClient.client.precertExpires
					? getLocalDayFromUTCDate(
							scheduledClient.client.precertExpires,
						)?.toLocaleDateString()
					: "-"}
			</TableCell>

			<TableCell>
				{scheduledClient.client.dob
					? formatClientAge(scheduledClient.client.dob)
					: ""}
			</TableCell>

			<TableCell
				className={isEditable ? "min-w-[300px]" : "max-w-[300px] truncate"}
			>
				{isEditable ? (
					<Input
						onBlur={() =>
							onUpdate?.(scheduledClient.clientId, {
								karenNotes: localKarenNotes,
							})
						}
						onChange={(e) => setLocalKarenNotes(e.target.value)}
						value={localKarenNotes}
					/>
				) : (
					scheduledClient.karenNotes || "-"
				)}
			</TableCell>
			<TableCell
				className={isEditable ? "min-w-[300px]" : "max-w-[300px] truncate"}
			>
				{isEditable ? (
					<Input
						onBlur={() =>
							onUpdate?.(scheduledClient.clientId, {
								barbaraNotes: localBarbaraNotes,
							})
						}
						onChange={(e) => setLocalBarbaraNotes(e.target.value)}
						value={localBarbaraNotes}
					/>
				) : (
					scheduledClient.barbaraNotes || "-"
				)}
			</TableCell>

			<TableCell>{actions}</TableCell>
		</TableRow>
	);
}

"use client";

import { Badge } from "@ui/badge";
import { DatePicker } from "@ui/date-picker";
import { ScrollArea } from "@ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Skeleton } from "@ui/skeleton";
import { Toggle } from "@ui/toggle";
import { add, format } from "date-fns";
import {
	AlertCircle,
	CalendarX,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	MapPin,
} from "lucide-react";
import { useState } from "react";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

type AvailEvent = {
	id: string | null | undefined;
	summary: string | null | undefined;
	start: Date;
	end: Date;
	isUnavailability: boolean;
	isAllDay: boolean;
	officeKeys?: string[] | undefined;
};

type EligibleEvaluator = {
	npi: number;
	providerName: string;
	hasCalendarAccess: boolean;
	matchingEvents: AvailEvent[];
	otherEvents: AvailEvent[];
};

type SchedulingClient = {
	clientId: number;
	fullName: string;
	office: string | null;
	asdAdhd: string | null;
	primaryInsurance: string | null;
	evaluatorNpi: number | null;
	notes: string | null;
	date: string | null;
	time: string | null;
	hasMatchingAppointment: boolean;
	eligibleEvaluators: EligibleEvaluator[];
};

type Office = {
	key: string;
	prettyName: string;
};

type DateRange = {
	startDate: Date;
	endDate: Date;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatEventDate(event: AvailEvent): string {
	const start =
		event.start instanceof Date ? event.start : new Date(event.start);
	const end = event.end instanceof Date ? event.end : new Date(event.end);
	const dateStr = format(start, "EEE MMM d");
	if (event.isAllDay) return dateStr;
	return `${dateStr}, ${format(start, "h:mm a")}–${format(end, "h:mm a")}`;
}

function groupEventsByDay(
	events: AvailEvent[],
): { day: Date; events: AvailEvent[] }[] {
	const map = new Map<string, { day: Date; events: AvailEvent[] }>();
	for (const event of events) {
		const start =
			event.start instanceof Date ? event.start : new Date(event.start);
		const key = format(start, "yyyy-MM-dd");
		if (!map.has(key)) map.set(key, { day: start, events: [] });
		map.get(key)?.events.push(event);
	}
	return [...map.values()].sort((a, b) => a.day.getTime() - b.day.getTime());
}

function groupOtherEventsByOffice(
	events: AvailEvent[],
	offices: Office[],
): { officeLabel: string; count: number }[] {
	const officeKeyMap = new Map(offices.map((o) => [o.key, o.prettyName]));
	officeKeyMap.set("Virtual", "Virtual");

	const counts = new Map<string, number>();
	for (const event of events) {
		for (const key of event.officeKeys ?? []) {
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.map(([key, count]) => ({
			officeLabel: officeKeyMap.get(key) ?? key,
			count,
		}))
		.sort((a, b) => b.count - a.count);
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function EventDateList({
	events,
	max = 4,
}: {
	events: AvailEvent[];
	max?: number;
}) {
	const days = groupEventsByDay(events);
	const shown = days.slice(0, max);
	const extra = days.length - shown.length;
	return (
		<span className="flex flex-wrap gap-x-3 gap-y-0.5">
			{shown.map(({ day, events: dayEvents }) => (
				<span className="text-xs" key={format(day, "yyyy-MM-dd")}>
					{dayEvents[0]
						? formatEventDate(dayEvents[0])
						: format(day, "EEE MMM d")}
					{dayEvents.length > 1 && (
						<span className="ml-0.5 text-muted-foreground">
							+{dayEvents.length - 1}
						</span>
					)}
				</span>
			))}
			{extra > 0 && (
				<span className="text-muted-foreground text-xs">
					+{extra} more days
				</span>
			)}
		</span>
	);
}

function MatchingEvaluatorRow({ evaluator }: { evaluator: EligibleEvaluator }) {
	return (
		<div className="flex flex-col gap-0.5 py-1.5">
			<span className="font-medium text-sm">{evaluator.providerName}</span>
			<EventDateList events={evaluator.matchingEvents} />
		</div>
	);
}

function OtherEvaluatorRow({
	evaluator,
	offices,
}: {
	evaluator: EligibleEvaluator;
	offices: Office[];
}) {
	const grouped = groupOtherEventsByOffice(evaluator.otherEvents, offices);
	return (
		<div className="flex flex-col gap-0.5 py-1.5">
			<span className="font-medium text-sm">{evaluator.providerName}</span>
			<span className="flex flex-wrap gap-x-2 text-muted-foreground text-xs">
				{grouped.map(({ officeLabel, count }) => (
					<span key={officeLabel}>
						{officeLabel}
						<span className="ml-0.5 opacity-60">({count})</span>
					</span>
				))}
			</span>
		</div>
	);
}

function EvaluatorSection({
	label,
	icon,
	borderColor,
	labelColor,
	children,
	defaultOpen = true,
}: {
	label: string;
	icon: React.ReactNode;
	borderColor: string;
	labelColor: string;
	children: React.ReactNode;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className={cn("border-l-2 pl-3", borderColor)}>
			<button
				className="flex w-full items-center gap-1.5 py-1 text-left"
				onClick={() => setOpen((v) => !v)}
				type="button"
			>
				{icon}
				<span
					className={cn(
						"font-semibold text-xs uppercase tracking-wide",
						labelColor,
					)}
				>
					{label}
				</span>
				{open ? (
					<ChevronDown className="ml-auto h-3 w-3 text-muted-foreground" />
				) : (
					<ChevronRight className="ml-auto h-3 w-3 text-muted-foreground" />
				)}
			</button>
			{open && <div className="divide-y">{children}</div>}
		</div>
	);
}

function NoAvailabilityList({
	evaluators,
}: {
	evaluators: EligibleEvaluator[];
}) {
	const [open, setOpen] = useState(false);
	if (evaluators.length === 0) return null;
	return (
		<div className="border-muted border-l-2 pl-3">
			<button
				className="flex w-full items-center gap-1.5 py-1 text-left"
				onClick={() => setOpen((v) => !v)}
				type="button"
			>
				<CalendarX className="h-3.5 w-3.5 text-muted-foreground" />
				<span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
					No availability ({evaluators.length})
				</span>
				{open ? (
					<ChevronDown className="ml-auto h-3 w-3 text-muted-foreground" />
				) : (
					<ChevronRight className="ml-auto h-3 w-3 text-muted-foreground" />
				)}
			</button>
			{open && (
				<div className="flex flex-wrap gap-x-3 gap-y-1 pb-1">
					{evaluators.map((e) => (
						<span
							className={cn(
								"text-xs",
								e.hasCalendarAccess
									? "text-muted-foreground"
									: "flex items-center gap-1 text-muted-foreground/60",
							)}
							key={e.npi}
						>
							{!e.hasCalendarAccess && <AlertCircle className="h-3 w-3" />}
							{e.providerName}
						</span>
					))}
				</div>
			)}
		</div>
	);
}

function ClientCard({
	client,
	offices,
}: {
	client: SchedulingClient;
	offices: Office[];
}) {
	const isVirtual = client.office === "Virtual";
	const officeName = isVirtual
		? "Virtual"
		: (offices.find((o) => o.key === client.office)?.prettyName ??
			client.office);

	const matching = client.eligibleEvaluators.filter(
		(e) => e.matchingEvents.length > 0,
	);
	const elsewhere = client.eligibleEvaluators.filter(
		(e) => e.matchingEvents.length === 0 && e.otherEvents.length > 0,
	);
	const none = client.eligibleEvaluators.filter(
		(e) => e.matchingEvents.length === 0 && e.otherEvents.length === 0,
	);

	const assignedEvaluator = client.evaluatorNpi
		? client.eligibleEvaluators.find((e) => e.npi === client.evaluatorNpi)
		: null;

	return (
		<div className="overflow-hidden rounded-lg border bg-card">
			{/* Header */}
			<div className="flex flex-wrap items-start gap-2 border-b px-4 py-3">
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-semibold">{client.fullName}</span>
						{client.office && (
							<Badge className="gap-1" variant="outline">
								<MapPin className="h-3 w-3" />
								{officeName}
							</Badge>
						)}
						{client.asdAdhd && (
							<Badge variant="secondary">{client.asdAdhd}</Badge>
						)}
						{client.primaryInsurance && (
							<Badge variant="outline">{client.primaryInsurance}</Badge>
						)}
						{assignedEvaluator && (
							<Badge className="bg-primary/10 text-primary" variant="outline">
								Assigned: {assignedEvaluator.providerName}
							</Badge>
						)}
					</div>
					{(client.notes ?? client.date ?? client.time) && (
						<div className="flex flex-wrap gap-x-4 text-muted-foreground text-xs">
							{(client.date ?? client.time) && (
								<span>
									{[client.date, client.time].filter(Boolean).join(" ")}
								</span>
							)}
							{client.notes && <span>{client.notes}</span>}
						</div>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{client.hasMatchingAppointment && (
						<Badge variant="secondary">Appt. exists</Badge>
					)}
					{matching.length > 0 ? (
						<span className="flex items-center gap-1 text-green-600 text-xs dark:text-green-400">
							<CheckCircle2 className="h-3.5 w-3.5" />
							{matching.length} {matching.length === 1 ? "match" : "matches"}
						</span>
					) : (
						<span className="text-muted-foreground text-xs">No matches</span>
					)}
				</div>
			</div>

			{/* Evaluator sections */}
			<div className="flex flex-col gap-2 px-4 py-3">
				{client.eligibleEvaluators.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No eligible evaluators assigned.
					</p>
				) : (
					<>
						{matching.length > 0 && (
							<EvaluatorSection
								borderColor="border-green-500"
								icon={
									<CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
								}
								label={
									isVirtual
										? "Available virtually"
										: `Available at ${officeName ?? "this office"}`
								}
								labelColor="text-green-700 dark:text-green-400"
							>
								{matching.map((e) => (
									<MatchingEvaluatorRow evaluator={e} key={e.npi} />
								))}
							</EvaluatorSection>
						)}

						{elsewhere.length > 0 && (
							<EvaluatorSection
								borderColor="border-amber-400"
								defaultOpen={matching.length === 0}
								icon={<MapPin className="h-3.5 w-3.5 text-amber-500" />}
								label="Available at other offices"
								labelColor="text-amber-600 dark:text-amber-400"
							>
								{elsewhere.map((e) => (
									<OtherEvaluatorRow
										evaluator={e}
										key={e.npi}
										offices={offices}
									/>
								))}
							</EvaluatorSection>
						)}

						<NoAvailabilityList evaluators={none} />
					</>
				)}
			</div>
		</div>
	);
}

function LoadingSkeleton() {
	return (
		<div className="space-y-4">
			{["a", "b", "c"].map((k) => (
				<div className="rounded-lg border bg-card" key={k}>
					<div className="flex items-center gap-3 border-b px-4 py-3">
						<Skeleton className="h-5 w-40" />
						<Skeleton className="h-5 w-16" />
						<Skeleton className="h-5 w-20" />
					</div>
					<div className="space-y-3 px-4 py-3">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-8 w-3/4" />
					</div>
				</div>
			))}
		</div>
	);
}

// ─── Main component ──────────────────────────────────────────────────────────

export function SchedulingHelper() {
	const [dateRange, setDateRange] = useState<DateRange>({
		startDate: new Date(),
		endDate: add(new Date(), { weeks: 8 }),
	});
	const [officeFilter, setOfficeFilter] = useState<string>("all");
	const [unassignedOnly, setUnassignedOnly] = useState(false);
	const [needsAppointmentOnly, setNeedsAppointmentOnly] = useState(false);

	const { data, isLoading } = api.scheduling.getDashboard.useQuery({
		startDate: dateRange.startDate,
		endDate: dateRange.endDate,
	});

	const offices: Office[] = data?.offices ?? [];

	const filteredClients =
		data?.clients.filter((c) => {
			if (officeFilter !== "all" && c.office !== officeFilter) return false;
			if (unassignedOnly && c.evaluatorNpi !== null) return false;
			if (needsAppointmentOnly && c.hasMatchingAppointment) return false;
			return true;
		}) ?? [];

	// Offices that appear in the current scheduling clients
	const activeOfficeKeys = new Set(
		(data?.clients ?? []).map((c) => c.office).filter(Boolean),
	);
	const activeOffices = offices.filter((o) => activeOfficeKeys.has(o.key));

	return (
		<div className="flex w-full flex-col gap-4">
			{/* Controls */}
			<div className="flex flex-wrap items-end justify-between gap-4">
				<h1 className="font-bold text-2xl">Scheduling Helper</h1>
				<div className="flex flex-wrap items-end gap-3">
					<Toggle
						aria-label="Show unassigned only"
						onPressedChange={setUnassignedOnly}
						pressed={unassignedOnly}
						size="sm"
						variant="outline"
					>
						Unassigned only
					</Toggle>
					<Toggle
						aria-label="Hide clients with existing appointments"
						onPressedChange={setNeedsAppointmentOnly}
						pressed={needsAppointmentOnly}
						size="sm"
						variant="outline"
					>
						Needs appointment
					</Toggle>
					<Select onValueChange={setOfficeFilter} value={officeFilter}>
						<SelectTrigger className="w-44">
							<SelectValue placeholder="All offices" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All offices</SelectItem>
							{activeOffices.map((o) => (
								<SelectItem key={o.key} value={o.key}>
									{o.prettyName}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<DatePicker
						date={dateRange.startDate}
						id="sched-helper-start"
						label="From"
						setDate={(date) => {
							if (!date) return;
							const newStart = new Date(date);
							setDateRange((prev) =>
								newStart >= prev.endDate
									? {
											startDate: newStart,
											endDate: add(newStart, { weeks: 8 }),
										}
									: { ...prev, startDate: newStart },
							);
						}}
					/>
					<DatePicker
						date={dateRange.endDate}
						id="sched-helper-end"
						label="To"
						setDate={(date) => {
							if (!date) return;
							const newEnd = new Date(date);
							setDateRange((prev) =>
								newEnd <= prev.startDate
									? { startDate: add(newEnd, { weeks: -8 }), endDate: newEnd }
									: { ...prev, endDate: newEnd },
							);
						}}
					/>
				</div>
			</div>

			{/* Summary bar */}
			{data && (
				<div className="flex flex-wrap gap-4 text-muted-foreground text-sm">
					<span>{filteredClients.length} clients</span>
					<span>
						{
							filteredClients.filter((c) =>
								c.eligibleEvaluators.some((e) => e.matchingEvents.length > 0),
							).length
						}{" "}
						with matches
					</span>
					<span>
						{
							filteredClients.filter(
								(c) =>
									!c.eligibleEvaluators.some(
										(e) => e.matchingEvents.length > 0,
									),
							).length
						}{" "}
						without matches
					</span>
				</div>
			)}

			{/* Client cards */}
			<ScrollArea className="h-[calc(100vh-180px)] w-full">
				{isLoading ? (
					<LoadingSkeleton />
				) : filteredClients.length === 0 ? (
					<p className="text-muted-foreground">
						{data ? "No clients on the scheduling table." : ""}
					</p>
				) : (
					<div className="w-full space-y-4 pr-4">
						{filteredClients.map((client) => (
							<ClientCard
								client={client as SchedulingClient}
								key={client.clientId}
								offices={offices}
							/>
						))}
					</div>
				)}
			</ScrollArea>
		</div>
	);
}

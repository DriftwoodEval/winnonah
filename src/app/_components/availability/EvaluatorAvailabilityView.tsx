"use client";

import { Badge } from "@ui/badge";
import { DatePicker } from "@ui/date-picker";
import { ScrollArea } from "@ui/scroll-area";
import { Skeleton } from "@ui/skeleton";
import {
	add,
	eachDayOfInterval,
	format,
	isSameDay,
	startOfDay,
} from "date-fns";
import { AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

type AvailabilityEvent = {
	id: string | null | undefined;
	summary: string | null | undefined;
	start: Date;
	end: Date;
	isUnavailability: boolean;
	isAllDay: boolean;
	officeKeys?: string[];
};

type EvaluatorResult = {
	npi: number;
	providerName: string;
	email: string;
	events: AvailabilityEvent[];
	hasCalendarAccess: boolean;
};

type DateRange = {
	startDate: Date;
	endDate: Date;
};

function EventRow({ event }: { event: AvailabilityEvent }) {
	return (
		<div
			className={cn(
				"flex items-center gap-3 rounded px-3 py-2 text-sm",
				event.isUnavailability
					? "bg-destructive/10 text-destructive"
					: "bg-primary/10 text-foreground",
			)}
		>
			<div
				className={cn(
					"h-2 w-2 shrink-0 rounded-full",
					event.isUnavailability ? "bg-destructive" : "bg-primary",
				)}
			/>
			<span className="min-w-0 flex-1 truncate">{event.summary ?? "Busy"}</span>
			<span className="shrink-0 text-muted-foreground text-xs">
				{event.isAllDay
					? "All day"
					: `${format(event.start, "h:mm a")} – ${format(event.end, "h:mm a")}`}
			</span>
		</div>
	);
}

function DaySection({
	day,
	events,
}: {
	day: Date;
	events: AvailabilityEvent[];
}) {
	const today = isSameDay(day, new Date());
	return (
		<div className="space-y-1">
			<div className="flex items-center gap-2">
				<span
					className={cn(
						"inline-flex h-6 min-w-6 items-center justify-center rounded px-1.5 font-semibold text-xs",
						today
							? "bg-primary text-primary-foreground"
							: "bg-muted text-muted-foreground",
					)}
				>
					{format(day, "MMM d")}
				</span>
				<span className="text-muted-foreground text-xs">
					{format(day, "EEEE")}
				</span>
			</div>
			<div className="space-y-1 pl-2">
				{events.map((event) => (
					<EventRow
						event={event}
						key={event.id ?? `${event.start}-${event.summary}`}
					/>
				))}
			</div>
		</div>
	);
}

function EvaluatorCard({
	evaluator,
	dateRange,
}: {
	evaluator: EvaluatorResult;
	dateRange: DateRange;
}) {
	const [open, setOpen] = useState(true);

	const days = eachDayOfInterval({
		start: startOfDay(dateRange.startDate),
		end: startOfDay(dateRange.endDate),
	});

	const eventsByDay = days
		.map((day) => ({
			day,
			events: evaluator.events.filter((e) => isSameDay(e.start, day)),
		}))
		.filter((d) => d.events.length > 0);

	const availableCount = evaluator.events.filter(
		(e) => !e.isUnavailability,
	).length;
	const unavailableCount = evaluator.events.filter(
		(e) => e.isUnavailability,
	).length;

	return (
		<div className="overflow-hidden rounded-lg border bg-card">
			<button
				className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
				onClick={() => setOpen((v) => !v)}
				type="button"
			>
				{open ? (
					<ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
				) : (
					<ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
				)}
				<span className="flex-1 font-semibold">{evaluator.providerName}</span>
				{!evaluator.hasCalendarAccess ? (
					<Badge className="gap-1" variant="outline">
						<AlertCircle className="h-3 w-3" />
						No calendar
					</Badge>
				) : evaluator.events.length === 0 ? (
					<Badge variant="secondary">No entries</Badge>
				) : (
					<div className="flex gap-2">
						{availableCount > 0 && (
							<Badge className="bg-primary/10 text-primary" variant="outline">
								{availableCount} available
							</Badge>
						)}
						{unavailableCount > 0 && (
							<Badge
								className="bg-destructive/10 text-destructive"
								variant="outline"
							>
								{unavailableCount} OOO
							</Badge>
						)}
					</div>
				)}
			</button>

			{open && (
				<div className="border-t px-4 py-3">
					{!evaluator.hasCalendarAccess ? (
						<p className="text-muted-foreground text-sm">
							This evaluator has not connected their Google Calendar.
						</p>
					) : eventsByDay.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							No availability entries in this date range.
						</p>
					) : (
						<div className="space-y-4">
							{eventsByDay.map(({ day, events }) => (
								<DaySection
									day={day}
									events={events}
									key={format(day, "yyyy-MM-dd")}
								/>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function LoadingSkeleton() {
	return (
		<div className="space-y-3">
			{["a", "b", "c", "d"].map((k) => (
				<div className="rounded-lg border bg-card p-4" key={k}>
					<div className="flex items-center gap-3">
						<Skeleton className="h-4 w-4" />
						<Skeleton className="h-5 w-48" />
						<Skeleton className="ml-auto h-5 w-24" />
					</div>
				</div>
			))}
		</div>
	);
}

export function EvaluatorAvailabilityView() {
	const [dateRange, setDateRange] = useState<DateRange>({
		startDate: new Date(),
		endDate: add(new Date(), { months: 2 }),
	});

	const { data, isLoading } = api.google.getAllEvaluatorsAvailability.useQuery({
		startDate: dateRange.startDate,
		endDate: dateRange.endDate,
	});

	return (
		<div className="flex w-full flex-col gap-6">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<h1 className="font-bold text-2xl">Evaluator Availability</h1>
				<div className="flex items-center gap-4">
					<DatePicker
						date={dateRange.startDate}
						id="eval-avail-start"
						label="From"
						setDate={(date) => {
							if (!date) return;
							const newStart = new Date(date);
							setDateRange((prev) =>
								newStart >= prev.endDate
									? {
											startDate: newStart,
											endDate: add(newStart, { months: 2 }),
										}
									: { ...prev, startDate: newStart },
							);
						}}
					/>
					<DatePicker
						date={dateRange.endDate}
						id="eval-avail-end"
						label="To"
						setDate={(date) => {
							if (!date) return;
							const newEnd = new Date(date);
							setDateRange((prev) =>
								newEnd <= prev.startDate
									? { startDate: add(newEnd, { months: -2 }), endDate: newEnd }
									: { ...prev, endDate: newEnd },
							);
						}}
					/>
				</div>
			</div>

			<ScrollArea className="h-[calc(100vh-160px)] w-full">
				{isLoading ? (
					<LoadingSkeleton />
				) : !data?.length ? (
					<p className="text-muted-foreground">No evaluators found.</p>
				) : (
					<div className="w-full space-y-3 pr-4">
						{data.map((evaluator) => (
							<EvaluatorCard
								dateRange={dateRange}
								evaluator={evaluator as EvaluatorResult}
								key={evaluator.npi}
							/>
						))}
					</div>
				)}
			</ScrollArea>
		</div>
	);
}

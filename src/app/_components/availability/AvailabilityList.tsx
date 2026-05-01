"use client";

import { DatePicker } from "@ui/date-picker";
import { ScrollArea, ScrollBar } from "@ui/scroll-area";
import { Skeleton } from "@ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import {
	add,
	addMonths,
	differenceInMinutes,
	eachDayOfInterval,
	format,
	isBefore,
	isSameDay,
	parseISO,
	startOfDay,
	startOfWeek,
	sub,
} from "date-fns";
import {
	Calendar as CalendarIcon,
	ChevronLeft,
	ChevronRight,
	Edit2,
	List,
	Lock,
	Repeat,
} from "lucide-react";
import { useState } from "react";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { Button } from "../ui/button";
import { EditAvailabilityDialog } from "./EditAvailabilityDialog";

type CalendarEvent = {
	id?: string;
	summary?: string;
	start: string | Date;
	end: string | Date;
	isUnavailability: boolean;
	isAllDay: boolean;
	officeKeys?: string[];
	recurrence?: string[];
	recurringEventId?: string | null;
};

type EditingEvent = {
	id: string;
	summary: string;
	start: Date;
	end: Date;
	isUnavailability: boolean;
	isAllDay: boolean;
	officeKeys?: string[];
	recurrence?: string[];
	recurringEventId?: string | null;
};

type DateRange = {
	startDate: Date;
	endDate: Date;
};

type EventsByDate = Record<string, CalendarEvent[]>;

const PIXELS_PER_MINUTE = 0.5;
const HOUR_HEIGHT_PX = 60 * PIXELS_PER_MINUTE;
const TOTAL_DAY_HEIGHT_PX = 24 * HOUR_HEIGHT_PX;
const MIN_EVENT_HEIGHT_PX = 18;
const CALENDAR_VIEWPORT_HEIGHT_PX = 480;

const HOURS_OF_DAY = Array.from({ length: 24 }, (_, i) => i);

const DAYS_ABBREV: Record<string, string> = {
	MO: "Mon",
	TU: "Tue",
	WE: "Wed",
	TH: "Thu",
	FR: "Fri",
	SA: "Sat",
	SU: "Sun",
};

function getRecurrenceDescription(
	recurrence: string[] | undefined,
): string | null {
	const rrule = recurrence?.[0];
	if (!rrule) return null;

	let freq = "";
	if (rrule.includes("FREQ=DAILY")) freq = "day";
	else if (rrule.includes("FREQ=WEEKLY")) freq = "week";
	else if (rrule.includes("FREQ=MONTHLY")) freq = "month";
	if (!freq) return null;

	const intervalMatch = rrule.match(/INTERVAL=(\d+)/);
	const interval = intervalMatch?.[1] ? parseInt(intervalMatch[1], 10) : 1;

	const base =
		interval === 1
			? freq === "day"
				? "Daily"
				: freq === "week"
					? "Weekly"
					: "Monthly"
			: `Every ${interval} ${freq}s`;

	const byDayMatch = rrule.match(/BYDAY=([^;]+)/);
	if (byDayMatch?.[1]) {
		const days = byDayMatch[1]
			.split(",")
			.map((d) => DAYS_ABBREV[d] ?? d)
			.join(", ");
		return `${base} on ${days}`;
	}

	const byMonthDayMatch = rrule.match(/BYMONTHDAY=([^;]+)/);
	if (byMonthDayMatch?.[1]) {
		return `${base} on day ${byMonthDayMatch[1]}`;
	}

	return base;
}

function toDate(value: string | Date): Date {
	return value instanceof Date ? value : new Date(value);
}

function isEventLocked(event: CalendarEvent): boolean {
	return isBefore(toDate(event.start), startOfDay(addMonths(new Date(), 1)));
}

function buildEventsByDate(events: CalendarEvent[]): EventsByDate {
	return events.reduce<EventsByDate>((acc, event) => {
		if (!event.id) return acc;

		const start = toDate(event.start);
		const end = toDate(event.end);
		const intervalEnd = event.isAllDay ? sub(end, { seconds: 1 }) : end;

		const days = eachDayOfInterval({
			start: startOfDay(start),
			end: startOfDay(intervalEnd),
		});

		for (const day of days) {
			const key = format(day, "yyyy-MM-dd");
			if (!acc[key]) {
				acc[key] = [];
			}
			acc[key].push(event);
		}
		return acc;
	}, {});
}

function toEditingEvent(event: CalendarEvent): EditingEvent | null {
	if (!event.id) return null;
	return {
		...event,
		id: event.id,
		summary: event.summary ?? "",
		start: toDate(event.start),
		end: toDate(event.end),
	};
}

function RecurrenceBadge({ recurrence }: { recurrence?: string[] }) {
	const desc = getRecurrenceDescription(recurrence);
	if (!desc) return null;
	return (
		<span
			className="flex items-center gap-1 text-muted-foreground text-xs"
			title={desc}
		>
			<Repeat className="h-3 w-3 shrink-0" />
			{desc}
		</span>
	);
}

function EventLockButton({
	locked,
	onEdit,
}: {
	locked: boolean;
	onEdit: () => void;
}) {
	if (locked) {
		return (
			<div
				className="absolute top-2 right-2 p-1 text-muted-foreground"
				title="Events less than one month away are locked."
			>
				<Lock className="h-4 w-4" />
			</div>
		);
	}
	return (
		<button
			className="absolute top-2 right-2 rounded-md p-1 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
			onClick={onEdit}
			type="button"
		>
			<Edit2 className="h-4 w-4 text-muted-foreground" />
		</button>
	);
}

const LOADING_SKELETON_KEYS = [
	"skeleton-a",
	"skeleton-b",
	"skeleton-c",
] as const;

function ListViewLoading() {
	return (
		<div className="space-y-6 p-4">
			{LOADING_SKELETON_KEYS.map((key) => (
				<div key={key}>
					<Skeleton className="mb-3 h-6 w-32" />
					<div className="space-y-2">
						<Skeleton className="h-16 w-full" />
						<Skeleton className="h-16 w-full" />
					</div>
				</div>
			))}
		</div>
	);
}

function ListViewEmpty() {
	return (
		<div className="p-8 text-center text-muted-foreground">
			<p>No availability entries found for the selected period.</p>
		</div>
	);
}

function ListViewEvent({
	event,
	dateKey,
	onEdit,
}: {
	event: CalendarEvent;
	dateKey: string;
	onEdit: (e: EditingEvent) => void;
}) {
	const locked = isEventLocked(event);
	const editing = toEditingEvent(event);

	return (
		<div
			className={cn(
				"group relative rounded-md border-l-4 bg-muted/50 p-3",
				event.isUnavailability ? "border-l-destructive" : "border-l-primary",
			)}
			key={`${dateKey}-${event.id}`}
		>
			<EventLockButton
				locked={locked}
				onEdit={() => editing && onEdit(editing)}
			/>
			<div className="flex flex-wrap items-center gap-2">
				<p
					className={cn(
						"font-medium",
						event.isUnavailability && "text-destructive",
					)}
				>
					{event.summary}
				</p>
				<RecurrenceBadge recurrence={event.recurrence} />
			</div>
			<p className="text-muted-foreground text-sm">
				{event.isAllDay
					? "All Day"
					: `${format(toDate(event.start), "h:mm a")} – ${format(toDate(event.end), "h:mm a")}`}
			</p>
		</div>
	);
}

function ListView({
	isLoading,
	events,
	eventsByDate,
	sortedDates,
	onEdit,
}: {
	isLoading: boolean;
	events: CalendarEvent[] | undefined;
	eventsByDate: EventsByDate;
	sortedDates: string[];
	onEdit: (e: EditingEvent) => void;
}) {
	return (
		<div className="h-[600px] overflow-hidden rounded-lg border bg-card">
			<ScrollArea className="h-full" type="auto">
				{isLoading ? (
					<ListViewLoading />
				) : !events?.length ? (
					<ListViewEmpty />
				) : (
					<div className="divide-y">
						{sortedDates.map((dateKey) => {
							const date = parseISO(dateKey);
							const dayEvents = eventsByDate[dateKey] ?? [];
							const today = isSameDay(date, new Date());

							return (
								<div className="p-4" key={dateKey}>
									<div className="mb-3 flex items-center gap-2">
										<div
											className={cn(
												"flex aspect-square flex-col items-center justify-center rounded-lg px-3 py-1",
												today
													? "bg-primary text-primary-foreground"
													: "bg-muted",
											)}
										>
											<p className="font-semibold text-sm leading-none">
												{format(date, "EEE")}
											</p>
											<p className="font-bold text-lg leading-none">
												{format(date, "d")}
											</p>
										</div>
										<div>
											<p className="font-semibold">
												{format(date, "MMM yyyy")}
											</p>
											{today && <p className="text-primary text-xs">Today</p>}
										</div>
									</div>
									<div className="ml-2 space-y-2 border-muted border-l-2 pl-4">
										{dayEvents.map((event) => (
											<ListViewEvent
												dateKey={dateKey}
												event={event}
												key={`${dateKey}-${event.id}`}
												onEdit={onEdit}
											/>
										))}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</ScrollArea>
		</div>
	);
}

function CalendarViewLoading({ daysCount }: { daysCount: number }) {
	const gridCols = `48px repeat(${daysCount}, calc((100% - 48px) / ${daysCount}))`;

	return (
		<div className="overflow-hidden rounded-lg border bg-card">
			<div className="min-w-[640px]">
				<div
					className="grid border-b"
					style={{ gridTemplateColumns: gridCols }}
				>
					<div className="border-r bg-muted/30 p-1 pb-2" />
					{Array.from({ length: daysCount }).map((_, i) => (
						<div
							className="flex flex-col items-center border-r bg-muted/30 p-2 last:border-r-0"
							// biome-ignore lint/suspicious/noArrayIndexKey: just a skeleton
							key={i}
						>
							<Skeleton className="mb-2 h-3 w-8 opacity-50" />
							<Skeleton className="h-8 w-8 rounded-full" />
							{/* All-day event placeholder */}
							<div className="mt-1 w-full px-1">
								{i % 3 === 0 && <Skeleton className="h-4 w-full rounded" />}
							</div>
						</div>
					))}
				</div>

				<div
					className="relative overflow-hidden"
					style={{ height: `${CALENDAR_VIEWPORT_HEIGHT_PX}px` }}
				>
					<div
						className="grid"
						style={{
							gridTemplateColumns: gridCols,
							height: `${TOTAL_DAY_HEIGHT_PX}px`,
						}}
					>
						<div className="border-r bg-card">
							{HOURS_OF_DAY.map((hour) => (
								<div
									className="relative"
									key={hour}
									style={{ height: `${HOUR_HEIGHT_PX}px` }}
								>
									{hour !== 0 && (
										<Skeleton className="absolute -top-1.5 right-1.5 h-2 w-6 opacity-30" />
									)}
								</div>
							))}
						</div>

						{Array.from({ length: daysCount }).map((_, colIdx) => (
							<div
								className="relative border-muted/30 border-l"
								// biome-ignore lint/suspicious/noArrayIndexKey: just a skeleton
								key={colIdx}
								style={{ height: `${TOTAL_DAY_HEIGHT_PX}px` }}
							>
								{HOURS_OF_DAY.map((hour) => (
									<div
										className="absolute inset-x-0 border-muted/30 border-b"
										key={hour}
										style={{
											top: `${hour * HOUR_HEIGHT_PX}px`,
											height: `${HOUR_HEIGHT_PX}px`,
										}}
									/>
								))}

								{colIdx % 2 === 0 && (
									<Skeleton
										className="absolute inset-x-1 rounded-sm opacity-20"
										style={{
											top: `${8 * HOUR_HEIGHT_PX}px`,
											height: `${HOUR_HEIGHT_PX * 1.5}px`,
										}}
									/>
								)}
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

function CalendarDayHeader({
	day,
	allDayEvents,
	onEdit,
}: {
	day: Date;
	allDayEvents: CalendarEvent[];
	onEdit: (e: EditingEvent) => void;
}) {
	const today = isSameDay(day, new Date());

	return (
		<div className="flex min-w-0 flex-col items-center bg-muted/30 p-2">
			<span className="text-muted-foreground text-xs">
				{format(day, "EEE")}
			</span>
			<span
				className={cn(
					"flex h-8 w-8 items-center justify-center rounded-full font-semibold text-lg",
					today && "bg-primary text-primary-foreground",
				)}
			>
				{format(day, "d")}
			</span>
			<div className="mt-1 w-full space-y-1">
				{allDayEvents.map((event) => (
					<AllDayEventBadge
						event={event}
						key={`allday-${event.id}`}
						onEdit={onEdit}
					/>
				))}
			</div>
		</div>
	);
}

function AllDayEventBadge({
	event,
	onEdit,
}: {
	event: CalendarEvent;
	onEdit: (e: EditingEvent) => void;
}) {
	const editing = toEditingEvent(event);
	const locked = isEventLocked(event);

	const handleActivate = () => {
		if (!locked && editing) onEdit(editing);
	};

	const sharedClassName = cn(
		"relative flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left font-medium text-[10px] leading-tight transition-all",
		"min-w-0 max-w-full overflow-hidden",
		event.isUnavailability
			? "bg-destructive text-destructive-foreground"
			: "bg-primary text-primary-foreground",
		locked
			? "cursor-not-allowed opacity-70"
			: "cursor-pointer hover:brightness-90",
	);

	const Content = () => (
		<>
			<span className="min-w-0 flex-1 truncate">{event.summary ?? "Busy"}</span>
			{locked && <Lock className="h-2.5 w-2.5 shrink-0 opacity-80" />}
		</>
	);

	if (locked) {
		return (
			<div className={sharedClassName}>
				<Content />
			</div>
		);
	}

	return (
		<button
			className={cn(
				sharedClassName,
				"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
			)}
			onClick={handleActivate}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") handleActivate();
			}}
			type="button"
		>
			<Content />
		</button>
	);
}
function CalendarTimedEvent({
	event,
	onEdit,
}: {
	event: CalendarEvent;
	onEdit: (e: EditingEvent) => void;
}) {
	const start = toDate(event.start);
	const end = toDate(event.end);
	const startMinutes = start.getHours() * 60 + start.getMinutes();
	const durationMinutes = differenceInMinutes(end, start);
	const locked = isEventLocked(event);
	const editing = toEditingEvent(event);

	const recurrenceDesc = getRecurrenceDescription(event.recurrence);

	const handleActivate = () => {
		if (!locked && editing) onEdit(editing);
	};

	const sharedClassName = cn(
		"absolute inset-x-0.5 overflow-hidden rounded border px-1.5 py-1 text-[11px] leading-[1.2] shadow-sm",
		"flex flex-col items-start justify-start",
		event.isUnavailability
			? "border-destructive/40 bg-destructive text-destructive-foreground"
			: "border-primary/40 bg-primary text-primary-foreground",
	);

	const style = {
		top: `${startMinutes * PIXELS_PER_MINUTE}px`,
		height: `${Math.max(durationMinutes * PIXELS_PER_MINUTE, MIN_EVENT_HEIGHT_PX)}px`,
	};

	const Content = () => (
		<>
			{locked && <Lock className="absolute top-1 right-1 h-3 w-3 opacity-60" />}

			<div
				className={cn(
					"wrap-normal w-full whitespace-normal text-left font-bold",
					locked && "pr-3",
				)}
			>
				{event.summary ?? "Busy"}
			</div>

			{recurrenceDesc && durationMinutes >= 45 && (
				<div className="wrap-break-word mt-1 flex w-full items-start gap-1 whitespace-normal text-[9px] italic leading-tight opacity-90">
					<Repeat className="mt-0.5 h-2.5 w-2.5 shrink-0" />
					<span className="min-w-0 flex-1">{recurrenceDesc}</span>
				</div>
			)}

			{durationMinutes >= 30 && (
				<div className="mt-auto w-full whitespace-nowrap pt-1 text-left text-[9px] opacity-80">
					{format(start, "h:mm a")}
				</div>
			)}
		</>
	);

	if (locked) {
		return (
			<div
				className={cn(sharedClassName, "cursor-not-allowed opacity-80")}
				style={style}
			>
				<Content />
			</div>
		);
	}

	return (
		<button
			className={cn(
				sharedClassName,
				"w-full transition-all hover:brightness-95 active:scale-[0.98]",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
			)}
			onClick={handleActivate}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") handleActivate();
			}}
			style={style}
			type="button"
		>
			<Content />
		</button>
	);
}

function CalendarView({
	displayDays,
	eventsByDate,
	onEdit,
}: {
	displayDays: Date[];
	eventsByDate: EventsByDate;
	onEdit: (e: EditingEvent) => void;
}) {
	const gridCols = `48px repeat(${displayDays.length}, calc((100% - 48px) / ${displayDays.length}))`;

	return (
		<div className="overflow-hidden rounded-lg border bg-card">
			<ScrollArea className="w-full" type="auto">
				<div className="min-w-[640px]">
					<div
						className="grid border-b"
						style={{ gridTemplateColumns: gridCols }}
					>
						<div className="flex items-end justify-center border-r bg-muted/30 p-1 pb-2 text-center text-[10px] text-muted-foreground leading-tight">
							{format(new Date(), "xxx")}
						</div>
						{displayDays.map((day) => {
							const dateStr = format(day, "yyyy-MM-dd");
							const allDayEvents = (eventsByDate[dateStr] ?? []).filter(
								(e) => e.isAllDay,
							);
							return (
								<CalendarDayHeader
									allDayEvents={allDayEvents}
									day={day}
									key={dateStr}
									onEdit={onEdit}
								/>
							);
						})}
					</div>

					<ScrollArea
						style={{ height: `${CALENDAR_VIEWPORT_HEIGHT_PX}px` }}
						type="auto"
					>
						<div
							className="grid"
							style={{
								gridTemplateColumns: gridCols,
								height: `${TOTAL_DAY_HEIGHT_PX}px`,
							}}
						>
							<div
								className="border-r bg-card"
								style={{ gridColumn: "1", gridRow: "1" }}
							>
								{HOURS_OF_DAY.map((hour) => (
									<div
										className="relative"
										key={hour}
										style={{ height: `${HOUR_HEIGHT_PX}px` }}
									>
										{hour !== 0 && (
											<span className="absolute -top-2 right-1.5 select-none text-[10px] text-muted-foreground">
												{format(new Date().setHours(hour, 0), "h a")}
											</span>
										)}
									</div>
								))}
							</div>

							{displayDays.map((day, colIdx) => {
								const dateStr = format(day, "yyyy-MM-dd");
								const timedEvents = (eventsByDate[dateStr] ?? []).filter(
									(e) => !e.isAllDay,
								);

								return (
									<div
										className="relative border-muted/30 border-l"
										key={dateStr}
										style={{
											gridColumn: colIdx + 2,
											gridRow: "1",
											height: `${TOTAL_DAY_HEIGHT_PX}px`,
										}}
									>
										{HOURS_OF_DAY.map((hour) => (
											<div
												className="pointer-events-none absolute inset-x-0 border-muted/30 border-b"
												key={hour}
												style={{
													top: `${hour * HOUR_HEIGHT_PX}px`,
													height: `${HOUR_HEIGHT_PX}px`,
												}}
											/>
										))}

										{timedEvents.map((event) => (
											<CalendarTimedEvent
												event={event}
												key={`timed-${event.id}`}
												onEdit={onEdit}
											/>
										))}
									</div>
								);
							})}
						</div>
					</ScrollArea>
				</div>
				<ScrollBar orientation="horizontal" />
			</ScrollArea>
		</div>
	);
}

function DateRangePicker({
	range,
	onChange,
}: {
	range: DateRange;
	onChange: (next: DateRange) => void;
}) {
	return (
		<div className="flex items-center gap-4">
			<DatePicker
				date={range.startDate}
				id="start-date-picker"
				label="Start Date"
				setDate={(date) => {
					if (!date) return;
					const newStart = new Date(date);
					onChange(
						newStart >= range.endDate
							? { startDate: newStart, endDate: add(newStart, { weeks: 1 }) }
							: { ...range, startDate: newStart },
					);
				}}
			/>
			<DatePicker
				date={range.endDate}
				id="end-date-picker"
				label="End Date"
				setDate={(date) => {
					if (!date) return;
					const newEnd = new Date(date);
					onChange(
						newEnd <= range.startDate
							? { startDate: sub(newEnd, { weeks: 1 }), endDate: newEnd }
							: { ...range, endDate: newEnd },
					);
				}}
			/>
		</div>
	);
}

function CalendarControls({
	range,
	onChange,
}: {
	range: DateRange;
	onChange: (next: DateRange) => void;
}) {
	const moveWeek = (direction: number) => {
		const offset = direction * 7;
		onChange({
			startDate: add(range.startDate, { days: offset }),
			endDate: add(range.endDate, { days: offset }),
		});
	};

	return (
		<div className="flex items-center gap-2">
			<Button
				className="cursor-pointer"
				onClick={() => moveWeek(-1)}
				size="icon"
				variant="outline"
			>
				<ChevronLeft aria-label="Previous week" className="h-4 w-4" />
			</Button>

			<div className="min-w-[200px] text-center font-medium">
				{format(range.startDate, "MMM d")} –{" "}
				{format(sub(range.endDate, { days: 1 }), "MMM d, yyyy")}
			</div>

			<Button
				className="cursor-pointer"
				onClick={() => moveWeek(1)}
				size="icon"
				variant="outline"
			>
				<ChevronRight aria-label="Next week" className="h-4 w-4" />
			</Button>
		</div>
	);
}

export function AvailabilityList() {
	const [activeTab, setActiveTab] = useState("list");
	const [dateRange, setDateRange] = useState<DateRange>({
		startDate: new Date(),
		endDate: add(new Date(), { months: 2 }),
	});

	const [editingEvent, setEditingEvent] = useState<EditingEvent | null>(null);

	const handleTabChange = (value: string) => {
		setActiveTab(value);
		const today = new Date();

		if (value === "calendar") {
			const start = startOfWeek(today, { weekStartsOn: 0 });
			setDateRange({
				startDate: start,
				endDate: add(start, { weeks: 1 }),
			});
		} else {
			const start = startOfDay(today);
			setDateRange({
				startDate: start,
				endDate: add(start, { months: 2 }),
			});
		}
	};

	const { data: rawEvents, isLoading } = api.google.getAvailability.useQuery({
		startDate: dateRange.startDate,
		endDate: dateRange.endDate,
		raw: true,
	});

	const events = rawEvents as CalendarEvent[] | undefined;
	const eventsByDate = events ? buildEventsByDate(events) : {};
	const sortedDates = Object.keys(eventsByDate).sort();

	const displayDays = eachDayOfInterval({
		start: startOfDay(dateRange.startDate),
		end: startOfDay(sub(dateRange.endDate, { days: 1 })),
	});

	return (
		<Tabs
			className="flex flex-col gap-4"
			onValueChange={handleTabChange}
			value={activeTab}
		>
			<div className="flex items-center justify-between">
				<h2 className="font-bold text-2xl">Upcoming Availability</h2>
				<TabsList>
					<TabsTrigger value="list">
						<List className="mr-2 h-4 w-4" />
						List
					</TabsTrigger>
					<TabsTrigger value="calendar">
						<CalendarIcon className="mr-2 h-4 w-4" />
						Calendar
					</TabsTrigger>
				</TabsList>
			</div>

			<div className="flex h-10 items-center">
				{activeTab === "list" ? (
					<DateRangePicker onChange={setDateRange} range={dateRange} />
				) : (
					<CalendarControls onChange={setDateRange} range={dateRange} />
				)}
			</div>

			<div className="min-h-[600px]">
				<TabsContent className="m-0 focus-visible:outline-none" value="list">
					<ListView
						events={events}
						eventsByDate={eventsByDate}
						isLoading={isLoading}
						onEdit={setEditingEvent}
						sortedDates={sortedDates}
					/>
				</TabsContent>

				<TabsContent
					className="m-0 focus-visible:outline-none"
					value="calendar"
				>
					{isLoading ? (
						<CalendarViewLoading daysCount={displayDays.length} />
					) : (
						<CalendarView
							displayDays={displayDays}
							eventsByDate={eventsByDate}
							onEdit={setEditingEvent}
						/>
					)}
				</TabsContent>
			</div>

			{editingEvent && (
				<EditAvailabilityDialog
					event={editingEvent}
					isOpen
					onClose={() => setEditingEvent(null)}
				/>
			)}
		</Tabs>
	);
}

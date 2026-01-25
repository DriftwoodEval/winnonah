"use client";

import { DatePicker } from "@ui/date-picker";
import { ScrollArea } from "@ui/scroll-area";
import { Skeleton } from "@ui/skeleton";
import {
	add,
	eachDayOfInterval,
	format,
	isSameDay,
	parseISO,
	startOfDay,
	sub,
} from "date-fns";
import { Edit2 } from "lucide-react";
import { useState } from "react";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { EditAvailabilityDialog } from "./EditAvailabilityDialog";

export function AvailabilityList() {
	const [availabilityDateRange, setAvailabilityDateRange] = useState({
		startDate: new Date(),
		endDate: add(new Date(), { weeks: 3 }),
	});

	const [editingEvent, setEditingEvent] = useState<{
		id: string;
		summary: string;
		start: Date;
		end: Date;
		isUnavailability: boolean;
		isAllDay: boolean;
		officeKeys?: string[];
		recurrence?: string[];
		recurringEventId?: string | null;
	} | null>(null);

	const { data: events, isLoading } = api.google.getAvailability.useQuery({
		startDate: availabilityDateRange.startDate,
		endDate: availabilityDateRange.endDate,
		raw: true,
	});

	const eventsByDate = events?.reduce(
		(acc, event) => {
			if (!event.id) return acc;
			const start = new Date(event.start);
			const end = new Date(event.end);

			// For all-day events, Google Calendar end date is the day AFTER the event ends
			// So an all-day event on Jan 24 has start=Jan 24, end=Jan 25.
			// differenceInDays(Jan 25, Jan 24) is 1.
			// But it's actually just 1 day.
			// For timed events, it works normally.
			let intervalEnd = end;
			if (event.isAllDay) {
				intervalEnd = sub(end, { seconds: 1 });
			}

			const days = eachDayOfInterval({
				start: startOfDay(start),
				end: startOfDay(intervalEnd),
			});

			for (const day of days) {
				const dateKey = format(day, "yyyy-MM-dd");
				if (!acc[dateKey]) {
					acc[dateKey] = [];
				}
				acc[dateKey].push(event);
			}
			return acc;
		},
		{} as Record<string, typeof events>,
	);

	const sortedDates = eventsByDate ? Object.keys(eventsByDate).sort() : [];

	return (
		<div className="flex flex-col gap-4">
			<h2 className="font-bold text-2xl">Upcoming Availability</h2>
			<div className="flex items-center gap-4">
				<DatePicker
					date={availabilityDateRange.startDate}
					id="start-date-picker"
					label="Start Date"
					setDate={(date) => {
						if (date) {
							const newStart = new Date(date);
							setAvailabilityDateRange((prev) => {
								// If new start date is after current end date, update end date
								if (newStart >= prev.endDate) {
									return {
										startDate: newStart,
										endDate: add(newStart, { weeks: 1 }),
									};
								}
								return {
									...prev,
									startDate: newStart,
								};
							});
						}
					}}
				/>
				<DatePicker
					date={availabilityDateRange.endDate}
					id="end-date-picker"
					label="End Date"
					setDate={(date) => {
						if (date) {
							const newEnd = new Date(date);
							setAvailabilityDateRange((prev) => {
								// If new end date is before current start date, update start date
								if (newEnd <= prev.startDate) {
									return {
										startDate: sub(newEnd, { weeks: 1 }),
										endDate: newEnd,
									};
								}
								return {
									...prev,
									endDate: newEnd,
								};
							});
						}
					}}
				/>
			</div>
			<ScrollArea
				className="max-h-[600px] rounded-lg border bg-card"
				type="auto"
			>
				{isLoading ? (
					<div className="space-y-6 p-4">
						{[...Array(3)].map(() => (
							<div key={crypto.randomUUID()}>
								<Skeleton className="mb-3 h-6 w-32" />
								<div className="space-y-2">
									<Skeleton className="h-16 w-full" />
									<Skeleton className="h-16 w-full" />
								</div>
							</div>
						))}
					</div>
				) : !events || events.length === 0 ? (
					<div className="p-8 text-center text-muted-foreground">
						<p>No availability entries found for the selected period.</p>
					</div>
				) : (
					<div className="divide-y">
						{sortedDates.map((dateKey) => {
							const date = parseISO(dateKey);
							const dayEvents = eventsByDate?.[dateKey];
							const isToday = isSameDay(date, new Date());

							return (
								<div className="p-4" key={dateKey}>
									<div className="mb-3 flex items-center gap-2">
										<div
											className={cn(
												"flex aspect-square flex-col items-center justify-center rounded-lg px-3 py-1 font-mono",
												isToday
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
											{isToday && <p className="text-primary text-xs">Today</p>}
										</div>
									</div>
									<div className="ml-2 space-y-2 border-muted border-l-2 pl-4">
										{dayEvents?.map((event) => (
											<div
												className={cn(
													"group relative rounded-md border-l-4 bg-muted/50 p-3",
													event.isUnavailability
														? "border-l-destructive"
														: "border-l-primary",
												)}
												key={`${dateKey}-${event.id}`}
											>
												<button
													className="absolute top-2 right-2 rounded-md p-1 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
													onClick={() => {
														if (event.id) {
															setEditingEvent({
																id: event.id,
																summary: event.summary || "",
																start: event.start,
																end: event.end,
																isUnavailability: event.isUnavailability,
																isAllDay: event.isAllDay,
																officeKeys: event.officeKeys,
																recurrence: event.recurrence,
																recurringEventId: event.recurringEventId,
															});
														}
													}}
													type="button"
												>
													<Edit2 className="h-4 w-4 text-muted-foreground" />
												</button>
												<p
													className={cn(
														"font-medium",
														event.isUnavailability && "text-destructive",
													)}
												>
													{event.summary}
												</p>
												<p className="text-muted-foreground text-sm">
													{event.isAllDay ? (
														"All Day"
													) : (
														<>
															{format(new Date(event.start), "h:mm a")} -{" "}
															{format(new Date(event.end), "h:mm a")}
														</>
													)}
												</p>
											</div>
										))}
									</div>
								</div>
							);
						})}
					</div>
				)}
			</ScrollArea>

			{editingEvent && (
				<EditAvailabilityDialog
					event={editingEvent}
					isOpen={!!editingEvent}
					onClose={() => setEditingEvent(null)}
				/>
			)}
		</div>
	);
}

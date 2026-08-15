"use client";

import { Button } from "@ui/button";
import { TooltipProvider } from "@ui/tooltip";
import { addDays, format, startOfWeek } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { BUSINESS_TIMEZONE } from "~/lib/constants";
import { api } from "~/trpc/react";
import {
	type AvailabilityWindow,
	buildColorMap,
	CalendarDayView,
	CalendarMultiDayView,
	DAY_END,
	DAY_START,
	type DateAvailabilityWindow,
} from "../day-ahead/CalendarGrid";

export type CalWidgetMode = "day" | "3day" | "week";

// ─── Availability backdrop + click-to-schedule helpers ────────────────────────

type RawAvailabilityEvent = {
	start: Date;
	end: Date;
	isUnavailability: boolean;
	isPlanned: boolean;
	isAllDay: boolean;
};

function eventCoversDate(
	event: RawAvailabilityEvent,
	dateStr: string,
): boolean {
	const dayStart = fromZonedTime(
		`${dateStr}T00:00:00`,
		BUSINESS_TIMEZONE,
	).getTime();
	const dayEnd = dayStart + 24 * 60 * 60 * 1000;
	return (
		new Date(event.start).getTime() < dayEnd &&
		new Date(event.end).getTime() > dayStart
	);
}

function allDayWindowFor(dateStr: string): { start: Date; end: Date } {
	const pad = (n: number) => String(n).padStart(2, "0");
	return {
		start: fromZonedTime(
			`${dateStr}T${pad(DAY_START)}:00:00`,
			BUSINESS_TIMEZONE,
		),
		end: fromZonedTime(`${dateStr}T${pad(DAY_END)}:00:00`, BUSINESS_TIMEZONE),
	};
}

function minutesToTimeString(minutesFromMidnight: number): string {
	const snapped = Math.round(minutesFromMidnight / 30) * 30;
	const total = ((snapped % (24 * 60)) + 24 * 60) % (24 * 60);
	const hours = Math.floor(total / 60);
	const minutes = total % 60;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// ─── Date range helpers ───────────────────────────────────────────────────────

function getDateRange(mode: CalWidgetMode, selectedDate: string): string[] {
	const anchor = new Date(`${selectedDate}T12:00:00`);
	if (mode === "day") return [selectedDate];
	if (mode === "3day")
		return [0, 1, 2].map((n) => format(addDays(anchor, n), "yyyy-MM-dd"));
	const monday = startOfWeek(anchor, { weekStartsOn: 1 });
	return [0, 1, 2, 3, 4, 5, 6].map((n) =>
		format(addDays(monday, n), "yyyy-MM-dd"),
	);
}

function shiftAmount(mode: CalWidgetMode): number {
	if (mode === "3day") return 3;
	if (mode === "week") return 7;
	return 1;
}

function displayLabel(mode: CalWidgetMode, dates: string[]): string {
	const first = new Date(`${dates[0]}T12:00:00`);
	if (mode === "day") return format(first, "MMM d");
	const last = new Date(`${dates.at(-1) ?? dates[0]}T12:00:00`);
	if (first.getMonth() === last.getMonth())
		return `${format(first, "MMM d")}–${format(last, "d")}`;
	return `${format(first, "MMM d")}–${format(last, "MMM d")}`;
}

// ─── Widget shell ─────────────────────────────────────────────────────────────

function WidgetShell({
	title,
	linkHref,
	nav,
	children,
}: {
	title: string;
	linkHref: string;
	nav: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex shrink-0 items-center gap-1 border-b px-3 py-2">
				<Link
					className="font-semibold text-sm hover:text-secondary"
					href={linkHref}
				>
					{title}
				</Link>
				{nav}
			</div>
			<div className="min-h-0 flex-1 overflow-auto p-2">{children}</div>
		</div>
	);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function CalendarViewWidget({ mode }: { mode: CalWidgetMode }) {
	const router = useRouter();
	const todayStr = format(new Date(), "yyyy-MM-dd");
	const [selectedDate, setSelectedDate] = useState(todayStr);

	const dateRange = useMemo(
		() => getDateRange(mode, selectedDate),
		[mode, selectedDate],
	);
	const todayInRange = dateRange.includes(todayStr);

	const { data, isLoading } = api.appointments.getCalendarRange.useQuery({
		startDate: dateRange[0] ?? todayStr,
		endDate: dateRange.at(-1) ?? todayStr,
	});

	const colorMap = useMemo(() => buildColorMap(data ?? []), [data]);

	const can = useCheckPermission();
	const canSchedule = can("pages:scheduling");

	const evaluatorNpis = useMemo(
		() => [...new Set((data ?? []).map((a) => a.evaluatorNpi))],
		[data],
	);

	const { data: availabilityByNpi } =
		api.schedulingHelper.getAvailability.useQuery(
			{
				evaluatorNpis,
				start: new Date(`${dateRange[0] ?? todayStr}T00:00:00`),
				end: new Date(`${dateRange.at(-1) ?? todayStr}T23:59:59`),
			},
			{ enabled: canSchedule && evaluatorNpis.length > 0 },
		);

	const dayAvailability: AvailabilityWindow[] = useMemo(() => {
		if (mode !== "day" || !availabilityByNpi) return [];
		const windows: AvailabilityWindow[] = [];
		for (const [npiStr, events] of Object.entries(availabilityByNpi)) {
			const npi = Number(npiStr);
			for (const event of events) {
				if (event.isUnavailability || event.isPlanned) continue;
				if (!eventCoversDate(event, selectedDate)) continue;
				const { start, end } = event.isAllDay
					? allDayWindowFor(selectedDate)
					: { start: new Date(event.start), end: new Date(event.end) };
				windows.push({
					evaluatorNpi: npi,
					start,
					end,
				});
			}
		}
		return windows;
	}, [mode, availabilityByNpi, selectedDate]);

	const multiDayAvailability: DateAvailabilityWindow[] = useMemo(() => {
		if (mode !== "3day" && mode !== "week") return [];
		if (!availabilityByNpi) return [];
		const rangesByDate = new Map<string, { start: number; end: number }[]>();
		for (const events of Object.values(availabilityByNpi)) {
			for (const event of events) {
				if (event.isUnavailability || event.isPlanned) continue;
				for (const d of dateRange) {
					if (!eventCoversDate(event, d)) continue;
					const { start, end } = event.isAllDay
						? allDayWindowFor(d)
						: { start: new Date(event.start), end: new Date(event.end) };
					const list = rangesByDate.get(d) ?? [];
					list.push({ start: start.getTime(), end: end.getTime() });
					rangesByDate.set(d, list);
				}
			}
		}
		const result: DateAvailabilityWindow[] = [];
		for (const [d, ranges] of rangesByDate) {
			ranges.sort((a, b) => a.start - b.start);
			const merged: { start: number; end: number }[] = [];
			for (const range of ranges) {
				const last = merged.at(-1);
				if (last && range.start <= last.end) {
					last.end = Math.max(last.end, range.end);
				} else {
					merged.push({ ...range });
				}
			}
			for (const m of merged) {
				result.push({
					date: d,
					start: new Date(m.start),
					end: new Date(m.end),
				});
			}
		}
		return result;
	}, [mode, availabilityByNpi, dateRange]);

	function handleDaySlotClick(npi: number, minutesFromMidnight: number) {
		const time = minutesToTimeString(minutesFromMidnight);
		router.push(
			`/scheduling/helper?npi=${npi}&date=${selectedDate}&time=${time}`,
		);
	}

	function handleMultiDaySlotClick(date: string, minutesFromMidnight: number) {
		const time = minutesToTimeString(minutesFromMidnight);
		router.push(`/scheduling/helper?date=${date}&time=${time}`);
	}

	const phoneNumbers = useMemo(
		() => [
			...new Set(
				(data ?? []).map((a) => a.clientPhone).filter((p): p is string => !!p),
			),
		],
		[data],
	);
	const { data: recentMessages, isLoading: messagesLoading } =
		api.quo.getRecentMessages.useQuery(
			{ phoneNumbers },
			{ enabled: phoneNumbers.length > 0 },
		);

	function navigate(dir: -1 | 1) {
		const anchor = new Date(`${selectedDate}T12:00:00`);
		setSelectedDate(
			format(addDays(anchor, dir * shiftAmount(mode)), "yyyy-MM-dd"),
		);
	}

	const LABEL: Record<CalWidgetMode, string> = {
		day: "Day",
		"3day": "3-Day",
		week: "Week",
	};

	const linkHref =
		mode === "day"
			? "/day-ahead?view=day"
			: mode === "3day"
				? "/day-ahead?view=3day"
				: "/day-ahead?view=week";

	const nav = (
		<div className="ml-auto flex items-center gap-0.5">
			<span className="text-muted-foreground text-xs tabular-nums">
				{displayLabel(mode, dateRange)}
			</span>
			{!todayInRange && (
				<Button
					className="h-5 px-1.5 text-[10px]"
					onClick={() => setSelectedDate(todayStr)}
					size="sm"
					variant="outline"
				>
					Today
				</Button>
			)}
			<Button
				className="h-6 w-6"
				onClick={() => navigate(-1)}
				size="icon"
				variant="ghost"
			>
				<ChevronLeft className="h-3 w-3" />
			</Button>
			<Button
				className="h-6 w-6"
				onClick={() => navigate(1)}
				size="icon"
				variant="ghost"
			>
				<ChevronRight className="h-3 w-3" />
			</Button>
		</div>
	);

	return (
		<TooltipProvider>
			<WidgetShell linkHref={linkHref} nav={nav} title={LABEL[mode]}>
				{isLoading ? (
					<p className="text-muted-foreground text-sm">Loading...</p>
				) : !data ? null : mode === "day" ? (
					<CalendarDayView
						appointments={data}
						availability={canSchedule ? dayAvailability : undefined}
						availabilityIntensity="light"
						colorMap={colorMap}
						messages={recentMessages ?? {}}
						messagesLoading={messagesLoading}
						onSlotClick={canSchedule ? handleDaySlotClick : undefined}
					/>
				) : (
					<CalendarMultiDayView
						appointments={data}
						availability={canSchedule ? multiDayAvailability : undefined}
						colorMap={colorMap}
						dates={dateRange}
						messages={recentMessages ?? {}}
						messagesLoading={messagesLoading}
						onSlotClick={canSchedule ? handleMultiDaySlotClick : undefined}
					/>
				)}
			</WidgetShell>
		</TooltipProvider>
	);
}

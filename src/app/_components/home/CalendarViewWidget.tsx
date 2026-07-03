"use client";

import { Button } from "@ui/button";
import { TooltipProvider } from "@ui/tooltip";
import { addDays, format, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "~/trpc/react";
import {
	buildColorMap,
	CalendarDayView,
	CalendarMultiDayView,
} from "../day-ahead/CalendarGrid";

export type CalWidgetMode = "day" | "3day" | "week";

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
					<CalendarDayView appointments={data} colorMap={colorMap} />
				) : (
					<CalendarMultiDayView
						appointments={data}
						colorMap={colorMap}
						dates={dateRange}
					/>
				)}
			</WidgetShell>
		</TooltipProvider>
	);
}

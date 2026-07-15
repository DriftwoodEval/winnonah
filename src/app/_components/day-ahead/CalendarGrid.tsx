"use client";

import { Badge } from "@ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { format } from "date-fns";
import Link from "next/link";
import { useMemo } from "react";
import { getLocalTimeFromUTCDate } from "~/lib/utils";

// ─── Grid constants ───────────────────────────────────────────────────────────

export const HOUR_HEIGHT = 64;
export const DAY_START = 7;
export const DAY_END = 20;
export const GRID_PADDING = 12;
export const TOTAL_HEIGHT =
	(DAY_END - DAY_START) * HOUR_HEIGHT + GRID_PADDING * 2;
export const GRID_HOURS = Array.from(
	{ length: DAY_END - DAY_START + 1 },
	(_, i) => DAY_START + i,
);

export const EVAL_COLORS = [
	"border-l-blue-400 bg-blue-50 dark:bg-blue-950/30",
	"border-l-emerald-400 bg-emerald-50 dark:bg-emerald-950/30",
	"border-l-violet-400 bg-violet-50 dark:bg-violet-950/30",
	"border-l-amber-400 bg-amber-50 dark:bg-amber-950/30",
	"border-l-rose-400 bg-rose-50 dark:bg-rose-950/30",
	"border-l-cyan-400 bg-cyan-50 dark:bg-cyan-950/30",
	"border-l-orange-400 bg-orange-50 dark:bg-orange-950/30",
	"border-l-teal-400 bg-teal-50 dark:bg-teal-950/30",
];
export const FALLBACK_COLOR = EVAL_COLORS[0] ?? "";

// ─── Shared type ──────────────────────────────────────────────────────────────

export type CalAppt = {
	id: string;
	startTime: Date;
	endTime: Date;
	daEval: string | null;
	asdAdhd: string | null;
	confirmedAt: Date | null;
	clientName: string;
	clientHash: string;
	locationKey: string | null;
	officeName: string | null;
	evaluatorNpi: number;
	evaluatorName: string;
	isCurrentUser: boolean;
};

// ─── Time helpers ─────────────────────────────────────────────────────────────

export function localDate(utcDate: Date): Date {
	return getLocalTimeFromUTCDate(utcDate) ?? new Date(utcDate);
}

export function formatTime(utcDate: Date): string {
	return format(localDate(new Date(utcDate)), "h:mm a");
}

export function apptDateKey(startTime: Date): string {
	return format(localDate(new Date(startTime)), "yyyy-MM-dd");
}

export function blockTop(startTime: Date): number {
	const d = localDate(new Date(startTime));
	const mins = d.getHours() * 60 + d.getMinutes();
	return Math.max(
		GRID_PADDING,
		((mins - DAY_START * 60) / 60) * HOUR_HEIGHT + GRID_PADDING,
	);
}

export function blockHeight(startTime: Date, endTime: Date): number {
	const durMin =
		(new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000;
	return Math.max((durMin / 60) * HOUR_HEIGHT, 24);
}

// ─── Color map ────────────────────────────────────────────────────────────────

export function buildColorMap(data: CalAppt[]): Map<number, string> {
	const map = new Map<number, string>();
	const byNpi = new Map<number, boolean>();
	for (const a of data) {
		if (!byNpi.has(a.evaluatorNpi)) byNpi.set(a.evaluatorNpi, a.isCurrentUser);
	}
	const sorted = [...byNpi.entries()].toSorted(
		([npiA, currA], [npiB, currB]) => {
			if (currA && !currB) return -1;
			if (!currA && currB) return 1;
			return npiA - npiB;
		},
	);
	sorted.forEach(([npi], i) => {
		map.set(npi, EVAL_COLORS[i % EVAL_COLORS.length] ?? FALLBACK_COLOR);
	});
	return map;
}

// ─── Lane assignment ──────────────────────────────────────────────────────────

export function assignLanes<T extends { startTime: Date; endTime: Date }>(
	appts: T[],
): { appt: T; lane: number; totalLanes: number }[] {
	const sorted = appts.toSorted(
		(a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
	);
	const laneEndMs: number[] = [];
	const result: { appt: T; lane: number; totalLanes: number }[] = [];
	for (const appt of sorted) {
		const startMs = new Date(appt.startTime).getTime();
		let lane = laneEndMs.findIndex((end) => end <= startMs);
		if (lane === -1) {
			lane = laneEndMs.length;
			laneEndMs.push(0);
		}
		laneEndMs[lane] = new Date(appt.endTime).getTime();
		result.push({ appt, lane, totalLanes: 0 });
	}
	const total = laneEndMs.length;
	for (const r of result) r.totalLanes = total;
	return result;
}

// ─── Time gutter ──────────────────────────────────────────────────────────────

export function TimeGutter() {
	return (
		<div
			className="relative w-14 shrink-0 border-r"
			style={{ height: TOTAL_HEIGHT }}
		>
			{GRID_HOURS.map((h, i) => (
				<div
					className="absolute right-2 text-[10px] text-muted-foreground tabular-nums leading-none"
					key={h}
					style={{ top: GRID_PADDING + i * HOUR_HEIGHT - 6 }}
				>
					{format(new Date(2000, 0, 1, h), "h a")}
				</div>
			))}
		</div>
	);
}

// ─── Grid lines ───────────────────────────────────────────────────────────────

export function GridLines() {
	return (
		<>
			{GRID_HOURS.map((h, i) => (
				<div
					className="absolute w-full border-border/40 border-t"
					key={h}
					style={{ top: GRID_PADDING + i * HOUR_HEIGHT }}
				/>
			))}
			{GRID_HOURS.slice(0, -1).map((h, i) => (
				<div
					className="absolute w-full border-border/20 border-t border-dashed"
					key={`half-${h}`}
					style={{ top: GRID_PADDING + i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
				/>
			))}
		</>
	);
}

// ─── Appointment block ────────────────────────────────────────────────────────

export function ApptBlock({
	appt,
	colorClass,
	showEvaluator = false,
	style,
}: {
	appt: CalAppt;
	colorClass: string;
	showEvaluator?: boolean;
	style?: React.CSSProperties;
}) {
	const location = appt.officeName ?? appt.locationKey ?? "Virtual";

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					className={`absolute overflow-hidden rounded-sm border border-l-2 px-1.5 py-0.5 shadow-sm ${colorClass}`}
					style={style}
				>
					<Link
						className="block truncate font-medium text-xs leading-tight hover:underline"
						href={`/clients/${appt.clientHash}`}
					>
						{appt.clientName}
					</Link>
					{showEvaluator && (
						<div className="truncate text-[10px] text-muted-foreground leading-tight">
							{appt.evaluatorName}
						</div>
					)}
					<div className="truncate text-[10px] text-muted-foreground tabular-nums leading-tight">
						{formatTime(appt.startTime)}–{formatTime(appt.endTime)} · {location}
					</div>
					<div className="mt-0.5 flex flex-wrap items-center gap-0.5">
						{appt.asdAdhd && (
							<Badge className="h-3.5 px-1 text-[9px]" variant="outline">
								{appt.asdAdhd}
							</Badge>
						)}
						{appt.daEval && (
							<Badge className="h-3.5 px-1 text-[9px]" variant="outline">
								{appt.daEval}
							</Badge>
						)}
						{appt.confirmedAt && (
							<Badge className="h-3.5 px-1 text-[9px] uppercase">
								Confirmed
							</Badge>
						)}
					</div>
				</div>
			</TooltipTrigger>
			<TooltipContent
				className="flex-col items-start gap-0.5 text-left"
				side="right"
				sideOffset={6}
			>
				<p className="font-semibold">{appt.clientName}</p>
				<p className="opacity-80">
					{formatTime(appt.startTime)} – {formatTime(appt.endTime)}
				</p>
				<p className="opacity-80">{location}</p>
				<p className="opacity-80">{appt.evaluatorName}</p>
				{(appt.asdAdhd ?? appt.daEval) && (
					<p className="opacity-80">
						{[appt.asdAdhd, appt.daEval].filter(Boolean).join(" · ")}
					</p>
				)}
				{appt.confirmedAt && <p className="opacity-80">Confirmed</p>}
			</TooltipContent>
		</Tooltip>
	);
}

// ─── Calendar day view (evaluator columns) ────────────────────────────────────

export function CalendarDayView({
	appointments,
	colorMap,
}: {
	appointments: CalAppt[];
	colorMap: Map<number, string>;
}) {
	const byEval = useMemo(() => {
		const map = new Map<
			number,
			{ name: string; npi: number; isCurrentUser: boolean; appts: CalAppt[] }
		>();
		for (const appt of appointments) {
			const existing = map.get(appt.evaluatorNpi) ?? {
				name: appt.evaluatorName,
				npi: appt.evaluatorNpi,
				isCurrentUser: appt.isCurrentUser,
				appts: [],
			};
			existing.appts.push(appt);
			map.set(appt.evaluatorNpi, existing);
		}
		return [...map.values()].toSorted((a, b) => {
			if (a.isCurrentUser) return -1;
			if (b.isCurrentUser) return 1;
			return a.name.localeCompare(b.name);
		});
	}, [appointments]);

	if (byEval.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">No appointments this day.</p>
		);
	}

	return (
		<div className="overflow-auto rounded-md border">
			<div className="sticky top-0 z-10 flex border-b bg-background">
				<div className="w-14 shrink-0 border-r" />
				{byEval.map((ev) => (
					<div
						className="min-w-0 flex-1 border-l px-3 py-2 first:border-l-0"
						key={ev.npi}
					>
						<div
							className={`truncate font-medium text-sm ${ev.isCurrentUser ? "text-primary" : ""}`}
						>
							{ev.name}
						</div>
						<div className="text-[10px] text-muted-foreground">
							{ev.appts.length} appt{ev.appts.length !== 1 ? "s" : ""}
						</div>
					</div>
				))}
			</div>
			<div className="flex">
				<TimeGutter />
				{byEval.map((ev) => (
					<div
						className="relative min-w-0 flex-1 border-l first:border-l-0"
						key={ev.npi}
						style={{ height: TOTAL_HEIGHT }}
					>
						<GridLines />
						{ev.appts.map((appt) => (
							<ApptBlock
								appt={appt}
								colorClass={colorMap.get(appt.evaluatorNpi) ?? FALLBACK_COLOR}
								key={appt.id}
								style={{
									top: blockTop(appt.startTime),
									height: blockHeight(appt.startTime, appt.endTime),
									left: 4,
									right: 4,
								}}
							/>
						))}
					</div>
				))}
			</div>
		</div>
	);
}

// ─── Calendar multi-day view (date columns) ───────────────────────────────────

export function CalendarMultiDayView({
	appointments,
	dates,
	colorMap,
}: {
	appointments: CalAppt[];
	dates: string[];
	colorMap: Map<number, string>;
}) {
	const byDate = useMemo(() => {
		const map = new Map<string, CalAppt[]>();
		for (const d of dates) map.set(d, []);
		for (const appt of appointments) {
			const key = apptDateKey(appt.startTime);
			const list = map.get(key);
			if (list) list.push(appt);
		}
		return map;
	}, [appointments, dates]);

	const todayStr = format(new Date(), "yyyy-MM-dd");

	return (
		<div className="overflow-auto rounded-md border">
			<div className="sticky top-0 z-10 flex border-b bg-background">
				<div className="w-14 shrink-0 border-r" />
				{dates.map((d) => {
					const date = new Date(`${d}T12:00:00`);
					const isToday = d === todayStr;
					return (
						<div
							className="min-w-0 flex-1 border-l px-3 py-2 text-center first:border-l-0"
							key={d}
						>
							<div
								className={`font-medium text-xs uppercase tracking-wide ${isToday ? "text-primary" : "text-muted-foreground"}`}
							>
								{format(date, "EEE")}
							</div>
							<div
								className={`font-semibold text-sm ${isToday ? "text-primary" : ""}`}
							>
								{format(date, "M/d")}
							</div>
						</div>
					);
				})}
			</div>
			<div className="flex">
				<TimeGutter />
				{dates.map((d) => {
					const dayAppts = byDate.get(d) ?? [];
					const lanes = assignLanes(dayAppts);
					return (
						<div
							className="relative min-w-0 flex-1 border-l first:border-l-0"
							key={d}
							style={{ height: TOTAL_HEIGHT }}
						>
							<GridLines />
							{lanes.map(({ appt, lane, totalLanes }) => (
								<ApptBlock
									appt={appt}
									colorClass={colorMap.get(appt.evaluatorNpi) ?? FALLBACK_COLOR}
									key={appt.id}
									showEvaluator
									style={{
										top: blockTop(appt.startTime),
										height: blockHeight(appt.startTime, appt.endTime),
										left: `calc(${(lane / totalLanes) * 100}% + 4px)`,
										right: `calc(${((totalLanes - lane - 1) / totalLanes) * 100}% + 2px)`,
									}}
								/>
							))}
						</div>
					);
				})}
			</div>
		</div>
	);
}

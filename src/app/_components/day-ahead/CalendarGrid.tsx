"use client";

import { Badge } from "@ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { format } from "date-fns";
import Link from "next/link";
import { createContext, useContext, useMemo, useState } from "react";
import {
	formatInBusinessTime,
	normalizePhoneNumber,
	toBusinessZonedTime,
} from "~/lib/utils";
import type { RouterOutputs } from "~/trpc/react";
import { Redact } from "../redaction/Redact";
import { RecentMessagesPopover } from "./RecentMessagesPopover";

type RecentMessagesMap = RouterOutputs["quo"]["getRecentMessages"];

// ─── Grid constants ───────────────────────────────────────────────────────────

export const HOUR_HEIGHT = 64;
export const DAY_START = 7;
export const DAY_END = 21;
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
	clientPhone: string | null;
	locationKey: string | null;
	officeName: string | null;
	evaluatorNpi: number;
	evaluatorName: string;
	isCurrentUser: boolean;
};

// ─── Messages popover open state ───────────────────────────────────────────────

// Shared across all appointment blocks in a view so that opening one
// appointment's message popover suppresses hover tooltips for every
// appointment, not just its own.
const MessagesPopoverOpenContext = createContext<{
	open: boolean;
	setOpen: (open: boolean) => void;
}>({ open: false, setOpen: () => undefined });

// ─── Time helpers ─────────────────────────────────────────────────────────────

// A Date whose local getters (getHours, getDate, etc.) reflect business
// time, for grid math that needs numeric hour/minute/day values.
export function localDate(utcDate: Date): Date {
	return toBusinessZonedTime(utcDate) ?? new Date(utcDate);
}

export function formatTime(utcDate: Date): string {
	return formatInBusinessTime(utcDate, "h:mm a");
}

export function apptDateKey(startTime: Date): string {
	return formatInBusinessTime(startTime, "yyyy-MM-dd");
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

export function assignLanes<
	T extends {
		evaluatorNpi: number;
		evaluatorName: string;
		isCurrentUser: boolean;
	},
>(appts: T[]): { appt: T; lane: number; totalLanes: number }[] {
	const firstByNpi = new Map<number, T>();
	for (const appt of appts) {
		if (!firstByNpi.has(appt.evaluatorNpi))
			firstByNpi.set(appt.evaluatorNpi, appt);
	}
	const sortedNpis = [...firstByNpi.keys()].toSorted((a, b) => {
		const evalA = firstByNpi.get(a);
		const evalB = firstByNpi.get(b);
		if (evalA?.isCurrentUser && !evalB?.isCurrentUser) return -1;
		if (!evalA?.isCurrentUser && evalB?.isCurrentUser) return 1;
		return (evalA?.evaluatorName ?? "").localeCompare(
			evalB?.evaluatorName ?? "",
		);
	});
	const laneByNpi = new Map<number, number>();
	sortedNpis.forEach((npi, i) => {
		laneByNpi.set(npi, i);
	});
	const totalLanes = sortedNpis.length;
	return appts.map((appt) => ({
		appt,
		lane: laneByNpi.get(appt.evaluatorNpi) ?? 0,
		totalLanes,
	}));
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
	messages,
	messagesLoading,
	tooltipSide = "right",
}: {
	appt: CalAppt;
	colorClass: string;
	showEvaluator?: boolean;
	style?: React.CSSProperties;
	messages: RecentMessagesMap;
	messagesLoading: boolean;
	tooltipSide?: "top" | "right" | "bottom" | "left";
}) {
	const durationMin =
		(new Date(appt.endTime).getTime() - new Date(appt.startTime).getTime()) /
		60000;
	const isShort = durationMin <= 60;
	const fullLocation = appt.officeName ?? appt.locationKey ?? "Virtual";
	const isVirtual =
		appt.locationKey === "VIRTUAL" || fullLocation === "Virtual";
	const badgeLocation = isShort
		? isVirtual
			? "V"
			: (appt.locationKey ?? appt.officeName ?? "V")
		: fullLocation;
	const heightPx = typeof style?.height === "number" ? style.height : undefined;
	const showBadges = heightPx === undefined || heightPx >= 40;
	const showEvaluatorLine =
		showEvaluator && (heightPx === undefined || heightPx >= 56);
	const [tooltipOpen, setTooltipOpen] = useState(false);
	const { open: messagesOpen, setOpen: setMessagesOpen } = useContext(
		MessagesPopoverOpenContext,
	);

	return (
		<Tooltip
			onOpenChange={(open) => {
				// Ignore hover changes on other appointments while a message
				// popover is open, so a stale "open" doesn't stick around and
				// pop the tooltip open the moment the popover closes.
				if (!messagesOpen) setTooltipOpen(open);
			}}
			open={tooltipOpen && !messagesOpen}
		>
			<TooltipTrigger asChild>
				<div
					className={`absolute overflow-hidden rounded-sm border border-l-2 py-0.5 pr-4 pl-1.5 shadow-sm ${colorClass}`}
					style={style}
				>
					<Link
						className="block truncate font-medium text-xs leading-tight hover:underline"
						href={`/clients/${appt.clientHash}`}
					>
						<Redact>{appt.clientName}</Redact>
					</Link>
					{showEvaluatorLine && (
						<div className="truncate text-[10px] text-muted-foreground leading-tight">
							{appt.evaluatorName}
						</div>
					)}
					<div className="truncate text-[10px] text-muted-foreground tabular-nums leading-tight">
						{formatTime(appt.startTime)}–{formatTime(appt.endTime)}
					</div>
					{showBadges && (
						<div className="mt-0.5 flex flex-wrap items-center gap-0.5 overflow-hidden">
							{appt.confirmedAt && (
								<Badge className="h-3.5 shrink-0 px-1 text-[9px] uppercase">
									{isShort ? "C" : "Confirmed"}
								</Badge>
							)}
							<Badge
								className="h-3.5 shrink-0 px-1 text-[9px]"
								variant="outline"
							>
								{badgeLocation}
							</Badge>
							{appt.asdAdhd && (
								<Badge
									className="h-3.5 shrink-0 px-1 text-[9px]"
									variant="outline"
								>
									{appt.asdAdhd}
								</Badge>
							)}
							{appt.daEval && (
								<Badge
									className="h-3.5 shrink-0 px-1 text-[9px]"
									variant="outline"
								>
									{appt.daEval}
								</Badge>
							)}
						</div>
					)}
					<RecentMessagesPopover
						appointmentStart={appt.startTime}
						className="absolute top-0.5 right-0.5"
						isLoading={messagesLoading}
						messages={
							appt.clientPhone
								? messages[normalizePhoneNumber(appt.clientPhone)]
								: undefined
						}
						onOpenChange={setMessagesOpen}
						phoneNumber={appt.clientPhone}
					/>
				</div>
			</TooltipTrigger>
			<TooltipContent
				className="flex-col items-start gap-0.5 text-left"
				side={tooltipSide}
				sideOffset={6}
			>
				<p className="font-semibold">
					<Redact>{appt.clientName}</Redact>
				</p>
				<p className="opacity-80">
					{formatTime(appt.startTime)} – {formatTime(appt.endTime)}
				</p>
				<p className="opacity-80">{fullLocation}</p>
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
	messages,
	messagesLoading,
}: {
	appointments: CalAppt[];
	colorMap: Map<number, string>;
	messages: RecentMessagesMap;
	messagesLoading: boolean;
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

	const [messagesOpen, setMessagesOpen] = useState(false);

	if (byEval.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">No appointments this day.</p>
		);
	}

	return (
		<MessagesPopoverOpenContext.Provider
			value={{ open: messagesOpen, setOpen: setMessagesOpen }}
		>
			<div className="overflow-auto rounded-md border">
				<div className="sticky top-0 z-10 flex border-b bg-background">
					<div className="w-14 shrink-0 border-r" />
					{byEval.map((ev) => (
						<div
							className="min-w-[110px] flex-1 border-l px-3 py-2 first:border-l-0"
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
							className="relative min-w-[110px] flex-1 border-l first:border-l-0"
							key={ev.npi}
							style={{ height: TOTAL_HEIGHT }}
						>
							<GridLines />
							{ev.appts.map((appt) => (
								<ApptBlock
									appt={appt}
									colorClass={colorMap.get(appt.evaluatorNpi) ?? FALLBACK_COLOR}
									key={appt.id}
									messages={messages}
									messagesLoading={messagesLoading}
									style={{
										top: blockTop(appt.startTime),
										height: blockHeight(appt.startTime, appt.endTime),
										left: 4,
										right: 4,
									}}
									tooltipSide={byEval.length === 1 ? "top" : "right"}
								/>
							))}
						</div>
					))}
				</div>
			</div>
		</MessagesPopoverOpenContext.Provider>
	);
}

// ─── Calendar multi-day view (date columns) ───────────────────────────────────

export function CalendarMultiDayView({
	appointments,
	dates,
	colorMap,
	messages,
	messagesLoading,
}: {
	appointments: CalAppt[];
	dates: string[];
	colorMap: Map<number, string>;
	messages: RecentMessagesMap;
	messagesLoading: boolean;
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

	const todayStr = formatInBusinessTime(new Date(), "yyyy-MM-dd");
	const [messagesOpen, setMessagesOpen] = useState(false);

	return (
		<MessagesPopoverOpenContext.Provider
			value={{ open: messagesOpen, setOpen: setMessagesOpen }}
		>
			<div className="overflow-auto rounded-md border">
				<div className="sticky top-0 z-10 flex border-b bg-background">
					<div className="w-14 shrink-0 border-r" />
					{dates.map((d) => {
						const date = new Date(`${d}T12:00:00`);
						const isToday = d === todayStr;
						const isEmpty = (byDate.get(d) ?? []).length === 0;
						return (
							<div
								className={`min-w-[70px] border-l px-3 py-2 text-center first:border-l-0 ${isEmpty ? "flex-[0.35]" : "flex-1"}`}
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
						const isEmpty = dayAppts.length === 0;
						return (
							<div
								className={`relative min-w-[70px] border-l first:border-l-0 ${isEmpty ? "flex-[0.35]" : "flex-1"}`}
								key={d}
								style={{ height: TOTAL_HEIGHT }}
							>
								<GridLines />
								{lanes.map(({ appt, lane, totalLanes }) => (
									<ApptBlock
										appt={appt}
										colorClass={
											colorMap.get(appt.evaluatorNpi) ?? FALLBACK_COLOR
										}
										key={appt.id}
										messages={messages}
										messagesLoading={messagesLoading}
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
		</MessagesPopoverOpenContext.Provider>
	);
}

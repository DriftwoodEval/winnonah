"use client";

import { Badge } from "@ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { format } from "date-fns";
import { DoorOpen, LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useMemo, useState } from "react";
import { cn, formatInBusinessTime, toBusinessZonedTime } from "~/lib/utils";
import type { RouterOutputs } from "~/trpc/react";
import { CheckInOutControl } from "../appointments/CheckInOutControl";
import { EvaluatorCheckInOutControl } from "../appointments/EvaluatorCheckInOutControl";
import { Redact } from "../redaction/Redact";
import { ApptMessagesPopover, type RecentMessagesMap } from "./DayAheadShared";

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
	arrivedAt: Date | null;
	arrivedBy: string | null;
	arrivedNote: string | null;
	startedAt: Date | null;
	startedBy: string | null;
	startedNote: string | null;
	leftAt: Date | null;
	leftBy: string | null;
	leftNote: string | null;
	/** Not a real appointment yet - render as a pending/ghost block instead. */
	isPreview?: boolean;
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

// Real-time Date objects (e.g. from Google Calendar, or a native date/time
// picker) need to be relabeled the same way real appointments are stored -
// naive America/New_York wall-clock values labeled UTC (see
// toBusinessZonedTime) - or they render shifted by the Eastern UTC
// offset. This assumes the browser's local timezone is America/New_York,
// matching that existing convention.
export function toFakeUtcDate(date: Date): Date {
	return new Date(
		Date.UTC(
			date.getFullYear(),
			date.getMonth(),
			date.getDate(),
			date.getHours(),
			date.getMinutes(),
			date.getSeconds(),
		),
	);
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

// ─── Check-in indicator ─────────────────────────────────────────────────────

const CHECKIN_STAGE_STYLES = {
	left: {
		icon: LogOut,
		className:
			"bg-emerald-100 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-400 dark:ring-emerald-400/20",
	},
	started: {
		icon: LogIn,
		className:
			"bg-blue-100 text-blue-700 ring-blue-600/20 dark:bg-blue-950/50 dark:text-blue-400 dark:ring-blue-400/20",
	},
	arrived: {
		icon: DoorOpen,
		className:
			"bg-amber-100 text-amber-700 ring-amber-600/20 dark:bg-amber-950/50 dark:text-amber-400 dark:ring-amber-400/20",
	},
	none: {
		icon: DoorOpen,
		className:
			"bg-background text-muted-foreground/70 ring-border hover:text-foreground",
	},
} as const;

function CheckinIndicator({ appt }: { appt: CalAppt }) {
	const stage = appt.leftAt
		? "left"
		: appt.startedAt
			? "started"
			: appt.arrivedAt
				? "arrived"
				: "none";
	const { icon: Icon, className } = CHECKIN_STAGE_STYLES[stage];

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					aria-label="Check-in status"
					className={cn(
						"absolute right-0.5 bottom-0.5 flex h-5 w-5 items-center justify-center rounded-full shadow-sm ring-1 transition-colors hover:scale-110",
						className,
					)}
					onClick={(e) => e.stopPropagation()}
					type="button"
				>
					<Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-auto"
				onClick={(e) => e.stopPropagation()}
			>
				<CheckInOutControl
					appointmentId={appt.id}
					arrivedAt={appt.arrivedAt}
					arrivedBy={appt.arrivedBy}
					arrivedNote={appt.arrivedNote}
					endTime={appt.endTime}
					isToday={
						apptDateKey(appt.startTime) ===
						formatInBusinessTime(new Date(), "yyyy-MM-dd")
					}
					leftAt={appt.leftAt}
					leftBy={appt.leftBy}
					leftNote={appt.leftNote}
					startedAt={appt.startedAt}
					startedBy={appt.startedBy}
					startedNote={appt.startedNote}
					startTime={appt.startTime}
				/>
			</PopoverContent>
		</Popover>
	);
}

// ─── Appointment block ────────────────────────────────────────────────────────

export function ApptBlock({
	appt,
	colorClass,
	showEvaluator = false,
	showMessages = true,
	style,
	messages,
	messagesLoading,
	tooltipSide = "right",
	canCheckin = false,
}: {
	appt: CalAppt;
	colorClass: string;
	showEvaluator?: boolean;
	/** Whether to show the recent-messages popover on each block. */
	showMessages?: boolean;
	style?: React.CSSProperties;
	messages: RecentMessagesMap;
	messagesLoading: boolean;
	tooltipSide?: "top" | "right" | "bottom" | "left";
	canCheckin?: boolean;
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
	const previewClass =
		"border-2 border-dashed border-primary bg-primary/10 dark:bg-primary/20 animate-pulse";

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
					className={`absolute overflow-hidden rounded-sm border border-l-2 py-0.5 pr-4 pl-1.5 shadow-sm ${appt.isPreview ? previewClass : colorClass}`}
					style={style}
				>
					{appt.isPreview ? (
						<div className="block truncate font-medium text-xs leading-tight">
							<Redact>{appt.clientName}</Redact>
						</div>
					) : (
						<Link
							className="block truncate font-medium text-xs leading-tight hover:underline"
							href={`/clients/${appt.clientHash}`}
						>
							<Redact>{appt.clientName}</Redact>
						</Link>
					)}
					{showEvaluatorLine && (
						<div className="truncate text-[10px] text-muted-foreground leading-tight">
							<Redact>{appt.evaluatorName}</Redact>
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
							{appt.isPreview && (
								<Badge
									className="h-3.5 px-1 text-[9px] uppercase"
									variant="outline"
								>
									Pending
								</Badge>
							)}
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
					{showMessages && (
						<ApptMessagesPopover
							appt={appt}
							className="absolute top-0.5 right-0.5"
							messages={messages}
							messagesLoading={messagesLoading}
							onOpenChange={setMessagesOpen}
						/>
					)}
					{canCheckin &&
						apptDateKey(appt.startTime) <=
							formatInBusinessTime(new Date(), "yyyy-MM-dd") && (
							<CheckinIndicator appt={appt} />
						)}
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
				<p className="opacity-80">
					<Redact>{appt.evaluatorName}</Redact>
				</p>
				{(appt.asdAdhd ?? appt.daEval) && (
					<p className="opacity-80">
						{[appt.asdAdhd, appt.daEval].filter(Boolean).join(" · ")}
					</p>
				)}
				{appt.confirmedAt && <p className="opacity-80">Confirmed</p>}
				{appt.isPreview && <p className="opacity-80">Not yet created</p>}
			</TooltipContent>
		</Tooltip>
	);
}

// ─── Calendar day view (evaluator columns) ────────────────────────────────────

export type AvailabilityWindow = {
	evaluatorNpi: number;
	// Same "fake UTC" convention as CalAppt.startTime/endTime (see
	// toFakeUtcDate in SchedulingHelper.tsx) - callers must relabel real
	// Google Calendar instants before passing them in here.
	start: Date;
	end: Date;
};

export function CalendarDayView({
	appointments,
	colorMap,
	messages,
	messagesLoading,
	canCheckin = false,
	evaluatorCheckins,
	evaluatorCheckinDate,
	availability,
	availabilityIntensity = "normal",
	extraEvaluators,
	showMessages = true,
	onSlotClick,
}: {
	appointments: CalAppt[];
	colorMap: Map<number, string>;
	messages: RecentMessagesMap;
	messagesLoading: boolean;
	canCheckin?: boolean;
	evaluatorCheckins?: Map<
		number,
		RouterOutputs["appointments"]["getEvaluatorCheckins"][number]
	>;
	evaluatorCheckinDate?: string;
	/** Rendered as a low-opacity layer behind appointment blocks. */
	availability?: AvailabilityWindow[];
	/** "light" drops the border for a more subtle backdrop (e.g. read-only calendars). */
	availabilityIntensity?: "normal" | "light";
	/**
	 * Evaluators to always show a column for, even with zero appointments this
	 * day - otherwise an evaluator with only an availability backdrop and no
	 * bookings yet would have nothing to render it behind.
	 */
	extraEvaluators?: { npi: number; name: string; isCurrentUser?: boolean }[];
	/** Whether to show the recent-messages popover on each appointment block. */
	showMessages?: boolean;
	/**
	 * Called with (evaluatorNpi, minutesFromMidnight) when a caller clicks the
	 * empty grid area for that evaluator's column - lets the caller turn a
	 * click position into a picked time. Omit to make the grid non-clickable.
	 */
	onSlotClick?: (npi: number, minutesFromMidnight: number) => void;
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
		for (const evaluator of extraEvaluators ?? []) {
			if (map.has(evaluator.npi)) continue;
			map.set(evaluator.npi, {
				name: evaluator.name,
				npi: evaluator.npi,
				isCurrentUser: evaluator.isCurrentUser ?? false,
				appts: [],
			});
		}
		return [...map.values()].toSorted((a, b) => {
			if (a.isCurrentUser) return -1;
			if (b.isCurrentUser) return 1;
			return a.name.localeCompare(b.name);
		});
	}, [appointments, extraEvaluators]);

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
					{byEval.map((ev) => {
						const checkin = evaluatorCheckins?.get(ev.npi);
						return (
							<div
								className="min-w-[110px] flex-1 border-l px-3 py-2 first:border-l-0"
								key={ev.npi}
							>
								<div
									className={`truncate font-medium text-sm ${ev.isCurrentUser ? "text-primary" : ""}`}
								>
									<Redact>{ev.name}</Redact>
								</div>
								<div className="text-[10px] text-muted-foreground">
									{ev.appts.length} appt{ev.appts.length !== 1 ? "s" : ""}
								</div>
								{evaluatorCheckins &&
									evaluatorCheckinDate &&
									!ev.isCurrentUser && (
										<div className="mt-1">
											<EvaluatorCheckInOutControl
												arrivedAt={checkin?.arrivedAt ?? null}
												arrivedBy={checkin?.arrivedBy ?? null}
												arrivedNote={checkin?.arrivedNote ?? null}
												compact
												date={evaluatorCheckinDate}
												evaluatorNpi={ev.npi}
												leftAt={checkin?.leftAt ?? null}
												leftBy={checkin?.leftBy ?? null}
												leftNote={checkin?.leftNote ?? null}
											/>
										</div>
									)}
							</div>
						);
					})}
				</div>
				<div className="flex">
					<TimeGutter />
					{byEval.map((ev) => (
						// biome-ignore lint/a11y/noStaticElementInteractions: click position picks a time, there's no spatial keyboard equivalent - the manual time input next to this calendar covers keyboard access.
						// biome-ignore lint/a11y/useKeyWithClickEvents: see above.
						<div
							className={`relative min-w-[110px] flex-1 border-l first:border-l-0 ${onSlotClick ? "cursor-pointer" : ""}`}
							key={ev.npi}
							onClick={
								onSlotClick
									? (e) => {
											const rect = e.currentTarget.getBoundingClientRect();
											const offsetY = e.clientY - rect.top;
											const minutesFromMidnight =
												DAY_START * 60 +
												((offsetY - GRID_PADDING) / HOUR_HEIGHT) * 60;
											onSlotClick(ev.npi, minutesFromMidnight);
										}
									: undefined
							}
							style={{ height: TOTAL_HEIGHT }}
						>
							<GridLines />
							{availability
								?.filter((a) => a.evaluatorNpi === ev.npi)
								.map((a) => (
									<div
										className={
											availabilityIntensity === "light"
												? "absolute rounded-sm bg-success/10"
												: "absolute rounded-sm border border-success/40 bg-success/20"
										}
										key={`avail-${ev.npi}-${a.start.getTime()}-${a.end.getTime()}`}
										style={{
											top: blockTop(a.start),
											height: blockHeight(a.start, a.end),
											left: 4,
											right: 4,
										}}
									/>
								))}
							{ev.appts.map((appt) => (
								<ApptBlock
									appt={appt}
									canCheckin={canCheckin}
									colorClass={colorMap.get(appt.evaluatorNpi) ?? FALLBACK_COLOR}
									key={appt.id}
									messages={messages}
									messagesLoading={messagesLoading}
									showMessages={showMessages}
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

// A per-date, evaluator-merged availability window - the multi-day view mixes
// evaluators into shared lanes, so a single evaluator's precise slot can't be
// placed reliably here. This just says "someone was available" over a range.
export type DateAvailabilityWindow = {
	date: string;
	start: Date;
	end: Date;
};

export function CalendarMultiDayView({
	appointments,
	dates,
	colorMap,
	messages,
	messagesLoading,
	canCheckin = false,
	availability,
	onSlotClick,
}: {
	appointments: CalAppt[];
	dates: string[];
	colorMap: Map<number, string>;
	messages: RecentMessagesMap;
	messagesLoading: boolean;
	canCheckin?: boolean;
	/** Rendered as a light background band per date. */
	availability?: DateAvailabilityWindow[];
	/**
	 * Called with (date, minutesFromMidnight) when the empty grid area for
	 * that date is clicked - lets the caller turn a click into a picked time.
	 */
	onSlotClick?: (date: string, minutesFromMidnight: number) => void;
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

	const byDateAvailability = useMemo(() => {
		const map = new Map<string, DateAvailabilityWindow[]>();
		for (const a of availability ?? []) {
			const list = map.get(a.date) ?? [];
			list.push(a);
			map.set(a.date, list);
		}
		return map;
	}, [availability]);

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
						const isEmpty =
							(byDate.get(d) ?? []).length === 0 &&
							(byDateAvailability.get(d) ?? []).length === 0;
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
						const dayAvailability = byDateAvailability.get(d) ?? [];
						const isEmpty =
							dayAppts.length === 0 && dayAvailability.length === 0;
						return (
							// biome-ignore lint/a11y/noStaticElementInteractions: click position picks a time, there's no spatial keyboard equivalent - the scheduling helper page this links to has a fully keyboard-accessible manual time input.
							// biome-ignore lint/a11y/useKeyWithClickEvents: see above.
							<div
								className={`relative min-w-[70px] border-l first:border-l-0 ${isEmpty ? "flex-[0.35]" : "flex-1"} ${onSlotClick ? "cursor-pointer" : ""}`}
								key={d}
								onClick={
									onSlotClick
										? (e) => {
												const rect = e.currentTarget.getBoundingClientRect();
												const offsetY = e.clientY - rect.top;
												const minutesFromMidnight =
													DAY_START * 60 +
													((offsetY - GRID_PADDING) / HOUR_HEIGHT) * 60;
												onSlotClick(d, minutesFromMidnight);
											}
										: undefined
								}
								style={{ height: TOTAL_HEIGHT }}
							>
								<GridLines />
								{dayAvailability.map((a) => (
									<div
										className="absolute rounded-sm bg-success/10"
										key={`avail-${d}-${a.start.getTime()}-${a.end.getTime()}`}
										style={{
											top: blockTop(a.start),
											height: blockHeight(a.start, a.end),
											left: 2,
											right: 2,
										}}
									/>
								))}
								{lanes.map(({ appt, lane, totalLanes }) => (
									<ApptBlock
										appt={appt}
										canCheckin={canCheckin}
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

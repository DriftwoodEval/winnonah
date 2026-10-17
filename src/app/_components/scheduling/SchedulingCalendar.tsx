"use client";

import { format } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import { Star, X } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";
import {
	assignColors,
	blockHeight,
	blockTop,
	DAY_END,
	DAY_START,
	GRID_PADDING,
	GridLines,
	HOUR_HEIGHT,
	TimeGutter,
	TOTAL_HEIGHT,
} from "~/app/_components/day-ahead/CalendarGrid";
import { Redact } from "~/app/_components/redaction/Redact";
import { useEvaluatorColors } from "~/hooks/use-evaluator-colors";
import { BUSINESS_TIMEZONE } from "~/lib/constants";
import type { TimeRange } from "~/lib/scheduling-slots";
import { cn, formatInBusinessTime } from "~/lib/utils";
import type { RouterOutputs } from "~/trpc/react";

export type CalendarBooking =
	RouterOutputs["schedulingHelper"]["getEvaluatorAppointmentsInRange"][number][number];

export type CalendarNote = { kind: "ooo" } | { kind: "planned"; label: string };

export type CalendarPreview = { npi: number; start: Date; end: Date };

const SNAP_MINUTES = 15;
const DRAG_THRESHOLD_PX = 4;
const DAY_START_MIN = DAY_START * 60;
const DAY_END_MIN = DAY_END * 60;
const DAY_HEADER_HEIGHT = 36;

type Drag = {
	kind: "create" | "move";
	appt: CalendarBooking | null;
	npi: number;
	day: string;
	startMin: number;
	endMin: number;
	// create: the minute the pointer went down at. move: minutes between the
	// block's top edge and the point it was grabbed at.
	anchorMin: number;
	originX: number;
	originY: number;
	moved: boolean;
};

function minutesAtY(clientY: number, bodyTop: number) {
	return (
		DAY_START_MIN + ((clientY - bodyTop - GRID_PADDING) / HOUR_HEIGHT) * 60
	);
}

function clampMinutes(minutes: number, min = DAY_START_MIN, max = DAY_END_MIN) {
	return Math.min(max, Math.max(min, minutes));
}

function floorSnap(minutes: number) {
	return Math.floor(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function roundSnap(minutes: number) {
	return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function topForMinutes(minutes: number) {
	return GRID_PADDING + ((minutes - DAY_START_MIN) / 60) * HOUR_HEIGHT;
}

function heightForMinutes(startMin: number, endMin: number) {
	return ((endMin - startMin) / 60) * HOUR_HEIGHT;
}

// A true UTC instant for a business-local minute-of-day on a calendar day.
function instantAt(day: string, minutes: number) {
	const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
	const mm = String(minutes % 60).padStart(2, "0");
	return fromZonedTime(`${day}T${hh}:${mm}:00`, BUSINESS_TIMEZONE);
}

function minutesOfDay(instant: Date) {
	const [hh = 0, mm = 0] = formatInBusinessTime(instant, "HH:mm")
		.split(":")
		.map(Number);
	return hh * 60 + mm;
}

function timeRangeLabel(start: Date, end: Date) {
	return `${formatInBusinessTime(start, "h:mm")}–${formatInBusinessTime(end, "h:mm a")}`;
}

// A Google Calendar style week view with one column per evaluator inside each
// day. Click or drag on empty space to place a placeholder of the evaluator's configured length, drag a placeholder to
// move it (across evaluators and days)
// Releasing only reports the change: the caller stages it behind its usual
// confirm step.
export function SchedulingCalendar({
	days,
	evaluators,
	appointmentsByNpi,
	windowsFor,
	noteFor,
	preview,
	pendingMove,
	assignedNpi,
	defaultDurationMinutes,
	onCreate,
	onMove,
	onSelect,
	onDelete,
}: {
	days: string[];
	evaluators: { npi: number; providerName: string }[];
	appointmentsByNpi: Record<number, CalendarBooking[]> | undefined;
	/** Marked availability for one evaluator-day, as UTC millisecond ranges. */
	windowsFor: (npi: number, day: string) => TimeRange[];
	noteFor: (npi: number, day: string) => CalendarNote | null;
	/** The slot currently staged for confirmation, drawn as a pending block. */
	preview: CalendarPreview | null;
	/** The evaluator already assigned to the client, marked with a star. */
	assignedNpi: number | null;
	/** A move awaiting confirmation, drawn at its new spot meanwhile. */
	pendingMove: {
		appointmentId: string;
		npi: number;
		start: Date;
		end: Date;
	} | null;
	/** Length of a block made by a plain click instead of a drag. */
	defaultDurationMinutes: (npi: number) => number;
	onCreate: (npi: number, day: string, start: Date, end: Date) => void;
	onMove: (
		appt: CalendarBooking,
		npi: number,
		day: string,
		start: Date,
		end: Date,
	) => void;
	onSelect: (npi: number, day: string) => void;
	onDelete: (appointmentId: string) => void;
}) {
	const [hiddenNpis, setHiddenNpis] = useState<Set<number>>(new Set());
	const [showAll, setShowAll] = useState(false);
	const dragRef = useRef<Drag | null>(null);
	const [, rerender] = useReducer((n: number) => n + 1, 0);
	const gutterRef = useRef<HTMLDivElement>(null);

	function setDrag(next: Drag | null) {
		dragRef.current = next;
		rerender();
	}

	const drag = dragRef.current;
	const dragging = drag !== null;

	useEffect(() => {
		if (!dragging) return;

		function bodyTop() {
			return gutterRef.current?.getBoundingClientRect().top ?? 0;
		}

		function handleMove(e: PointerEvent) {
			const d = dragRef.current;
			if (!d) return;
			const moved =
				d.moved ||
				Math.hypot(e.clientX - d.originX, e.clientY - d.originY) >
					DRAG_THRESHOLD_PX;
			if (!moved) return;
			const pointerMin = minutesAtY(e.clientY, bodyTop());
			const next = { ...d, moved };

			if (d.kind === "create") {
				const duration = d.endMin - d.startMin;
				next.startMin = clampMinutes(
					floorSnap(pointerMin),
					DAY_START_MIN,
					DAY_END_MIN - duration,
				);
				next.endMin = next.startMin + duration;
			} else {
				const duration = d.endMin - d.startMin;
				next.startMin = clampMinutes(
					roundSnap(pointerMin - d.anchorMin),
					DAY_START_MIN,
					DAY_END_MIN - duration,
				);
				next.endMin = next.startMin + duration;
				const column = document
					.elementFromPoint(e.clientX, e.clientY)
					?.closest<HTMLElement>("[data-col]");
				if (column?.dataset.npi && column.dataset.day) {
					next.npi = Number(column.dataset.npi);
					next.day = column.dataset.day;
				}
			}
			setDrag(next);
		}

		function handleUp() {
			const d = dragRef.current;
			setDrag(null);
			if (!d) return;

			if (d.kind === "create") {
				onCreate(
					d.npi,
					d.day,
					instantAt(d.day, d.startMin),
					instantAt(d.day, d.endMin),
				);
				return;
			}

			if (!d.appt) return;
			if (!d.moved) {
				onSelect(d.npi, d.day);
				return;
			}
			onMove(
				d.appt,
				d.npi,
				d.day,
				instantAt(d.day, d.startMin),
				instantAt(d.day, d.endMin),
			);
		}

		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") setDrag(null);
		}

		window.addEventListener("pointermove", handleMove);
		window.addEventListener("pointerup", handleUp);
		window.addEventListener("keydown", handleKey);
		return () => {
			window.removeEventListener("pointermove", handleMove);
			window.removeEventListener("pointerup", handleUp);
			window.removeEventListener("keydown", handleKey);
		};
	});

	function startCreate(
		e: React.PointerEvent<HTMLDivElement>,
		npi: number,
		day: string,
	) {
		if (e.button !== 0) return;
		const bodyTop = gutterRef.current?.getBoundingClientRect().top ?? 0;
		const anchorMin = minutesAtY(e.clientY, bodyTop);
		setDrag({
			kind: "create",
			appt: null,
			npi,
			day,
			startMin: floorSnap(anchorMin),
			endMin: floorSnap(anchorMin) + defaultDurationMinutes(npi),
			anchorMin,
			originX: e.clientX,
			originY: e.clientY,
			moved: false,
		});
	}

	function startBlockDrag(
		e: React.PointerEvent<HTMLElement>,
		appt: CalendarBooking,
		npi: number,
		day: string,
	) {
		if (e.button !== 0) return;
		e.stopPropagation();
		const blockRect = e.currentTarget
			.closest("[data-block]")
			?.getBoundingClientRect();
		const startMin = minutesOfDay(appt.startTime);
		setDrag({
			kind: "move",
			appt,
			npi,
			day,
			startMin,
			endMin: minutesOfDay(appt.endTime),
			anchorMin: blockRect
				? ((e.clientY - blockRect.top) / HOUR_HEIGHT) * 60
				: 0,
			originX: e.clientX,
			originY: e.clientY,
			moved: false,
		});
	}

	function selectBooked(
		e: React.PointerEvent<HTMLElement>,
		npi: number,
		day: string,
	) {
		e.stopPropagation();
		onSelect(npi, day);
	}

	function toggleEvaluator(npi: number) {
		setHiddenNpis((prev) => {
			const next = new Set(prev);
			if (!next.delete(npi)) next.add(npi);
			return next;
		});
	}

	const chosenColors = useEvaluatorColors();
	const colorByNpi = assignColors(
		evaluators.map((ev) => ev.npi),
		chosenColors,
	);
	const shown = evaluators.filter((ev) => !hiddenNpis.has(ev.npi));
	// Unless "show all" is on, a day only gets columns for evaluators who have
	// marked availability or a booking that day, which keeps the grid readable.
	function evsFor(day: string) {
		if (showAll) return shown;
		return shown.filter(
			(ev) =>
				windowsFor(ev.npi, day).length > 0 ||
				(appointmentsByNpi?.[ev.npi] ?? []).some((a) => a.date === day),
		);
	}
	const columnCount = days.reduce(
		(sum, day) => sum + Math.max(1, evsFor(day).length),
		0,
	);
	const today = formatInBusinessTime(new Date(), "yyyy-MM-dd");
	const pendingAppt = pendingMove
		? (appointmentsByNpi ? Object.values(appointmentsByNpi).flat() : []).find(
				(a) => a.id === pendingMove.appointmentId,
			)
		: undefined;
	const pendingGhost: Drag | null =
		pendingMove && pendingAppt
			? {
					kind: "move",
					appt: pendingAppt,
					npi: pendingMove.npi,
					day: formatInBusinessTime(pendingMove.start, "yyyy-MM-dd"),
					startMin: minutesOfDay(pendingMove.start),
					endMin: minutesOfDay(pendingMove.end),
					anchorMin: 0,
					originX: 0,
					originY: 0,
					moved: true,
				}
			: null;
	const ghost = drag?.moved ? drag : pendingGhost;

	return (
		<div className="flex flex-col">
			<div className="flex flex-wrap gap-1.5 border-b p-2">
				<label className="flex items-center gap-1.5 pr-2 text-xs">
					<input
						checked={showAll}
						onChange={(e) => setShowAll(e.target.checked)}
						type="checkbox"
					/>
					Show all evaluators every day
				</label>
				{evaluators.map((ev) => {
					const visible = !hiddenNpis.has(ev.npi);
					return (
						<button
							aria-pressed={visible}
							className={cn(
								"flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
								visible
									? "bg-background"
									: "text-muted-foreground line-through opacity-60",
							)}
							key={ev.npi}
							onClick={() => toggleEvaluator(ev.npi)}
							type="button"
						>
							<span
								className={cn(
									"h-2.5 w-2.5 rounded-full border-l-4 bg-transparent",
									colorByNpi.get(ev.npi),
								)}
							/>
							<Redact>{ev.providerName}</Redact>
							{ev.npi === assignedNpi && <AssignedStar />}
						</button>
					);
				})}
			</div>

			{shown.length === 0 ? (
				<p className="p-4 text-muted-foreground text-sm">
					Turn on at least one evaluator above.
				</p>
			) : (
				<div
					className={cn(
						"max-h-[75vh] overflow-y-auto overflow-x-hidden",
						dragging && "select-none",
					)}
				>
					<div
						className="grid"
						style={{
							gridTemplateColumns: `56px repeat(${columnCount}, minmax(0, 1fr))`,
						}}
					>
						<div
							className="sticky top-0 left-0 z-30 border-r border-b bg-background"
							style={{ height: DAY_HEADER_HEIGHT }}
						/>
						{days.map((day) => (
							<div
								className={cn(
									"sticky top-0 z-20 flex items-center justify-center border-b border-l-2 bg-background font-medium text-sm",
									day === today && "text-primary",
								)}
								key={day}
								style={{
									gridColumn: `span ${Math.max(1, evsFor(day).length)}`,
									height: DAY_HEADER_HEIGHT,
								}}
							>
								{format(new Date(`${day}T12:00:00`), "EEE M/d")}
							</div>
						))}

						<div
							className="sticky left-0 z-30 border-r border-b bg-background"
							style={{ top: DAY_HEADER_HEIGHT }}
						/>
						{days.flatMap((day) =>
							(evsFor(day).length === 0 ? [null] : evsFor(day)).map((ev, i) =>
								ev === null ? (
									<div
										className="sticky z-20 border-b border-l-2 bg-background"
										key={`${day}-none-head`}
										style={{ top: DAY_HEADER_HEIGHT }}
									/>
								) : (
									<div
										className={cn(
											"sticky z-20 truncate border-b bg-background px-1 py-1 text-center text-[11px] text-muted-foreground",
											i === 0 ? "border-l-2" : "border-l",
											colorByNpi.get(ev.npi)?.split(" ")[0],
										)}
										key={`${day}-${ev.npi}-head`}
										style={{ top: DAY_HEADER_HEIGHT }}
										title={ev.providerName}
									>
										<Redact>{initialsOf(ev.providerName)}</Redact>
										{ev.npi === assignedNpi && <AssignedStar />}
									</div>
								),
							),
						)}

						<div className="sticky left-0 z-10 bg-background" ref={gutterRef}>
							<TimeGutter />
						</div>
						{days.flatMap((day) =>
							(evsFor(day).length === 0 ? [null] : evsFor(day)).map((ev, i) => {
								if (ev === null) {
									return (
										<div
											className="border-l-2 bg-muted/30"
											key={`${day}-none`}
											style={{ height: TOTAL_HEIGHT }}
										/>
									);
								}
								const note = noteFor(ev.npi, day);
								const booked = (appointmentsByNpi?.[ev.npi] ?? []).filter(
									(a) => a.date === day,
								);
								const dayStart = instantAt(day, DAY_START_MIN).getTime();
								const dayEnd = instantAt(day, DAY_END_MIN).getTime();
								const showPreview =
									preview?.npi === ev.npi &&
									formatInBusinessTime(preview.start, "yyyy-MM-dd") === day;
								const showGhost = ghost?.npi === ev.npi && ghost.day === day;
								return (
									<div
										className={cn(
											"relative cursor-crosshair",
											i === 0 ? "border-l-2" : "border-l",
											colorByNpi.get(ev.npi),
										)}
										data-col
										data-day={day}
										data-npi={ev.npi}
										key={`${day}-${ev.npi}`}
										onPointerDown={(e) => startCreate(e, ev.npi, day)}
										style={{ height: TOTAL_HEIGHT }}
									>
										<GridLines />
										{windowsFor(ev.npi, day).map((w) => {
											const start = Math.max(w.start, dayStart);
											const end = Math.min(w.end, dayEnd);
											if (end <= start) return null;
											return (
												<div
													className="pointer-events-none absolute inset-x-0.5 rounded-sm bg-success/15"
													key={`${w.start}-${w.end}`}
													style={{
														top: blockTop(new Date(start)),
														height: blockHeight(new Date(start), new Date(end)),
													}}
												/>
											);
										})}
										{note?.kind === "ooo" && (
											<div className="pointer-events-none absolute inset-0 bg-muted/70" />
										)}
										{note && (
											<div className="pointer-events-none absolute inset-x-0 top-0 truncate px-1 text-center text-[10px] text-muted-foreground">
												{note.kind === "ooo" ? "OOO" : note.label}
											</div>
										)}
										{booked.map((appt) => {
											const isPlaceholder = appt.placeholder;
											const beingDragged =
												(drag?.appt?.id === appt.id && drag.moved) ||
												pendingMove?.appointmentId === appt.id;
											const height = blockHeight(appt.startTime, appt.endTime);
											return (
												<div
													className={cn(
														"group absolute inset-x-0.5 overflow-hidden rounded-sm border px-1 py-0.5 text-[11px] leading-tight shadow-sm",
														isPlaceholder
															? "cursor-grab border-2 border-warning border-dashed bg-warning/15 active:cursor-grabbing dark:bg-warning/25"
															: `border-l-4 ${colorByNpi.get(ev.npi) ?? ""}`,
														beingDragged && "pointer-events-none opacity-40",
													)}
													data-block
													key={appt.id}
													onPointerDown={(e) =>
														isPlaceholder
															? startBlockDrag(e, appt, ev.npi, day)
															: selectBooked(e, ev.npi, day)
													}
													style={{ top: blockTop(appt.startTime), height }}
												>
													<div className="truncate font-medium">
														<Redact>{appt.clientName ?? "Appointment"}</Redact>
													</div>
													{height >= 36 && (
														<div className="truncate text-[10px] text-muted-foreground tabular-nums">
															{timeRangeLabel(appt.startTime, appt.endTime)}
														</div>
													)}
													{isPlaceholder && (
														<button
															aria-label="Delete placeholder"
															className="absolute top-0.5 right-0.5 hidden rounded-sm bg-background/80 p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
															onClick={() => onDelete(appt.id)}
															onPointerDown={(e) => e.stopPropagation()}
															type="button"
														>
															<X className="h-3 w-3" />
														</button>
													)}
												</div>
											);
										})}
										{showPreview && preview && (
											<div
												className="pointer-events-none absolute inset-x-0.5 animate-pulse overflow-hidden rounded-sm border-2 border-primary border-dashed bg-primary/10 px-1 py-0.5 text-[11px] dark:bg-primary/20"
												style={{
													top: blockTop(preview.start),
													height: blockHeight(preview.start, preview.end),
												}}
											>
												<div className="truncate font-medium">
													New placeholder
												</div>
												<div className="truncate text-[10px] text-muted-foreground tabular-nums">
													{timeRangeLabel(preview.start, preview.end)}
												</div>
											</div>
										)}
										{showGhost && ghost && (
											<div
												className="pointer-events-none absolute inset-x-0.5 z-10 overflow-hidden rounded-sm border-2 border-primary bg-primary/20 px-1 py-0.5 text-[11px] shadow-md"
												style={{
													top: topForMinutes(ghost.startMin),
													height: heightForMinutes(
														ghost.startMin,
														ghost.endMin,
													),
												}}
											>
												<div className="truncate font-medium">
													{ghost.appt ? (
														<Redact>
															{ghost.appt.clientName ?? "Placeholder"}
														</Redact>
													) : (
														"New placeholder"
													)}
												</div>
												<div className="truncate text-[10px] tabular-nums">
													{timeRangeLabel(
														instantAt(ghost.day, ghost.startMin),
														instantAt(ghost.day, ghost.endMin),
													)}
												</div>
											</div>
										)}
									</div>
								);
							}),
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function AssignedStar() {
	return (
		<Star
			aria-label="Assigned evaluator"
			className="inline h-3 w-3 shrink-0 fill-warning text-warning"
		/>
	);
}

// "First (Preferred) Last" uses the preferred name, so it gives "PL".
function initialsOf(name: string) {
	const preferred = /\(([^)]+)\)/.exec(name)?.[1];
	const words = name
		.replace(/\([^)]*\)/g, "")
		.split(/\s+/)
		.filter(Boolean);
	const first = preferred ?? words[0] ?? "";
	const last = words.length > 1 ? (words.at(-1) ?? "") : "";
	return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

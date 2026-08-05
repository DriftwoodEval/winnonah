"use client";

import { Button } from "@ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@ui/collapsible";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Separator } from "@ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@ui/toggle-group";
import { TooltipProvider } from "@ui/tooltip";
import { addDays, format, startOfWeek } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { IS_DEV } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import { CheckInOutControl } from "../appointments/CheckInOutControl";
import { EvaluatorCheckInOutControl } from "../appointments/EvaluatorCheckInOutControl";
import { Redact } from "../redaction/Redact";
import {
	type AvailabilityWindow,
	buildColorMap,
	CalendarDayView,
	CalendarMultiDayView,
	DAY_END,
	DAY_START,
	type DateAvailabilityWindow,
	formatTime,
	toFakeUtcDate,
} from "./CalendarGrid";
import {
	ApptMessagesPopover,
	ApptTypeBadges,
	ClientPortalLinks,
	ConfirmedBadge,
	collectPhoneNumbers,
	findGreeter,
	GreeterInline,
	GreeterLine,
	type GreeterSchedule,
	type RecentMessagesMap,
} from "./DayAheadShared";

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
	const dayStart = new Date(`${dateStr}T00:00:00`).getTime();
	const dayEnd = dayStart + 24 * 60 * 60 * 1000;
	return (
		new Date(event.start).getTime() < dayEnd &&
		new Date(event.end).getTime() > dayStart
	);
}

function allDayWindowFor(dateStr: string): { start: Date; end: Date } {
	const day = new Date(`${dateStr}T00:00:00`);
	const start = new Date(day);
	start.setHours(DAY_START, 0, 0, 0);
	const end = new Date(day);
	end.setHours(DAY_END, 0, 0, 0);
	return { start, end };
}

function minutesToTimeString(minutesFromMidnight: number): string {
	const snapped = Math.round(minutesFromMidnight / 30) * 30;
	const total = ((snapped % (24 * 60)) + 24 * 60) % (24 * 60);
	const hours = Math.floor(total / 60);
	const minutes = total % 60;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

type ViewMode = "list" | "day" | "3day" | "week";

// ─── List view types ──────────────────────────────────────────────────────────

type ListAppt = {
	id: string;
	startTime: Date;
	endTime: Date;
	daEval: string | null;
	asdAdhd: string | null;
	clientName: string;
	clientHash: string;
	clientDriveId?: string | null;
	clientTaHash?: string | null;
	clientPhone?: string | null;
	locationKey?: string | null;
	officeName?: string | null;
	confirmedAt?: Date | null;
	calendarEventTitle?: string | null;
	arrivedAt: Date | null;
	arrivedBy: string | null;
	arrivedNote: string | null;
	startedAt: Date | null;
	startedBy: string | null;
	startedNote: string | null;
	leftAt: Date | null;
	leftBy: string | null;
	leftNote: string | null;
};

type ListEvaluatorAppt = {
	id: string;
	startTime: Date;
	endTime: Date;
	daEval: string | null;
	asdAdhd: string | null;
	clientName: string;
	clientHash: string;
	clientDriveId: string | null;
	clientTaHash: string | null;
	clientPhone: string | null;
	confirmedAt: Date | null;
	arrivedAt: Date | null;
	arrivedBy: string | null;
	arrivedNote: string | null;
	startedAt: Date | null;
	startedBy: string | null;
	startedNote: string | null;
	leftAt: Date | null;
	leftBy: string | null;
	leftNote: string | null;
};

// ─── List view components ─────────────────────────────────────────────────────

function AppointmentRow({
	appt,
	messages,
	messagesLoading,
	canCheckin,
	isToday,
}: {
	appt: ListAppt;
	messages: RecentMessagesMap;
	messagesLoading: boolean;
	canCheckin: boolean;
	isToday: boolean;
}) {
	return (
		<div className="flex items-center gap-3 py-2">
			<span className="w-36 shrink-0 text-muted-foreground text-sm tabular-nums">
				{formatTime(appt.startTime)} – {formatTime(appt.endTime)}
			</span>
			<Link
				className="truncate font-medium hover:text-secondary"
				href={`/clients/${appt.clientHash}`}
			>
				<Redact>{appt.clientName}</Redact>
			</Link>
			<ClientPortalLinks
				driveId={appt.clientDriveId}
				size={14}
				taHash={appt.clientTaHash}
			/>
			<ApptTypeBadges appt={appt} />
			<ConfirmedBadge confirmedAt={appt.confirmedAt ?? null} />
			<ApptMessagesPopover
				appt={appt}
				messages={messages}
				messagesLoading={messagesLoading}
			/>
			{canCheckin && (
				<CheckInOutControl
					appointmentId={appt.id}
					arrivedAt={appt.arrivedAt}
					arrivedBy={appt.arrivedBy}
					arrivedNote={appt.arrivedNote}
					compact
					endTime={appt.endTime}
					isToday={isToday}
					leftAt={appt.leftAt}
					leftBy={appt.leftBy}
					leftNote={appt.leftNote}
					startedAt={appt.startedAt}
					startedBy={appt.startedBy}
					startedNote={appt.startedNote}
					startTime={appt.startTime}
				/>
			)}
			<span className="ml-auto shrink-0 text-muted-foreground text-xs">
				{appt.officeName ?? appt.locationKey ?? "Virtual"}
			</span>
		</div>
	);
}

function EvaluatorRow({
	evaluator,
	messages,
	messagesLoading,
	canCheckin,
	isToday,
	asDate,
}: {
	evaluator: {
		name: string;
		npi: number;
		isCurrentUser: boolean;
		checkin: {
			arrivedAt: Date | null;
			arrivedBy: string | null;
			arrivedNote: string | null;
			leftAt: Date | null;
			leftBy: string | null;
			leftNote: string | null;
		};
		appointments: ListEvaluatorAppt[];
	};
	messages: RecentMessagesMap;
	messagesLoading: boolean;
	canCheckin: boolean;
	isToday: boolean;
	asDate: string;
}) {
	const [open, setOpen] = useState(false);

	const first = evaluator.appointments[0];
	const last = evaluator.appointments.at(-1);
	const timeRange =
		first && last
			? `${formatTime(first.startTime)} – ${formatTime(last.endTime)}`
			: null;

	return (
		<Collapsible onOpenChange={setOpen} open={open}>
			<div className="flex w-full items-center gap-2 py-1.5">
				<CollapsibleTrigger className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left hover:opacity-80">
					{open ? (
						<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					) : (
						<ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					)}
					<span className={evaluator.isCurrentUser ? "font-semibold" : ""}>
						<Redact>{evaluator.name}</Redact>
					</span>
					<span className="text-muted-foreground text-xs">
						{evaluator.appointments.length} appt
						{evaluator.appointments.length !== 1 ? "s" : ""}
					</span>
				</CollapsibleTrigger>
				{canCheckin && (
					<EvaluatorCheckInOutControl
						arrivedAt={evaluator.checkin.arrivedAt}
						arrivedBy={evaluator.checkin.arrivedBy}
						arrivedNote={evaluator.checkin.arrivedNote}
						compact
						date={asDate}
						evaluatorNpi={evaluator.npi}
						leftAt={evaluator.checkin.leftAt}
						leftBy={evaluator.checkin.leftBy}
						leftNote={evaluator.checkin.leftNote}
					/>
				)}
				{timeRange && (
					<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
						{timeRange}
					</span>
				)}
			</div>
			<CollapsibleContent>
				<div className="ml-8 border-border border-l pl-4">
					{evaluator.appointments.map((appt) => (
						<div className="flex items-center gap-3 py-1.5" key={appt.id}>
							<span className="w-32 shrink-0 text-muted-foreground text-xs tabular-nums">
								{formatTime(appt.startTime)} – {formatTime(appt.endTime)}
							</span>
							<Link
								className="truncate text-sm hover:text-secondary"
								href={`/clients/${appt.clientHash}`}
							>
								<Redact>{appt.clientName}</Redact>
							</Link>
							<ClientPortalLinks
								driveId={appt.clientDriveId}
								size={12}
								taHash={appt.clientTaHash}
							/>
							<ApptTypeBadges appt={appt} className="shrink-0 text-xs" />
							<ConfirmedBadge confirmedAt={appt.confirmedAt} />
							<ApptMessagesPopover
								appt={appt}
								messages={messages}
								messagesLoading={messagesLoading}
							/>
							{canCheckin && (
								<CheckInOutControl
									appointmentId={appt.id}
									arrivedAt={appt.arrivedAt}
									arrivedBy={appt.arrivedBy}
									arrivedNote={appt.arrivedNote}
									compact
									endTime={appt.endTime}
									isToday={isToday}
									leftAt={appt.leftAt}
									leftBy={appt.leftBy}
									leftNote={appt.leftNote}
									startedAt={appt.startedAt}
									startedBy={appt.startedBy}
									startedNote={appt.startedNote}
									startTime={appt.startTime}
								/>
							)}
						</div>
					))}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

// ─── Dev controls ─────────────────────────────────────────────────────────────

function DevControls({
	asUserId,
	onUserChange,
}: {
	asUserId: string | undefined;
	onUserChange: (id: string | undefined) => void;
}) {
	const { data: users } = api.users.getAll.useQuery();
	return (
		<Select
			onValueChange={(v) => onUserChange(v === "__self" ? undefined : v)}
			value={asUserId ?? "__self"}
		>
			<SelectTrigger className="h-7 w-48 text-xs">
				<SelectValue placeholder="View as..." />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="__self">Myself</SelectItem>
				{users?.map((u) => (
					<SelectItem key={u.id} value={u.id}>
						{u.name ?? u.email}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

// ─── Date range helpers ────────────────────────────────────────────────────────

function getDateRange(mode: ViewMode, selectedDate: string): string[] {
	const anchor = new Date(`${selectedDate}T12:00:00`);
	if (mode === "list" || mode === "day") return [selectedDate];
	if (mode === "3day")
		return [0, 1, 2].map((n) => format(addDays(anchor, n), "yyyy-MM-dd"));
	const monday = startOfWeek(anchor, { weekStartsOn: 1 });
	return [0, 1, 2, 3, 4, 5, 6].map((n) =>
		format(addDays(monday, n), "yyyy-MM-dd"),
	);
}

function shiftAmount(mode: ViewMode): number {
	if (mode === "3day") return 3;
	if (mode === "week") return 7;
	return 1;
}

function displayDateLabel(mode: ViewMode, dates: string[]): string {
	const first = new Date(`${dates[0]}T12:00:00`);
	if (mode === "list" || mode === "day") return format(first, "EEEE, MMMM d");
	const last = new Date(`${dates.at(-1) ?? dates[0]}T12:00:00`);
	if (first.getMonth() === last.getMonth()) {
		return `${format(first, "MMM d")}–${format(last, "d")}`;
	}
	return `${format(first, "MMM d")}–${format(last, "MMM d")}`;
}

// ─── Main component ────────────────────────────────────────────────────────────

const VALID_VIEWS: ViewMode[] = ["list", "day", "3day", "week"];

export function DayAheadContent() {
	const router = useRouter();
	const searchParams = useSearchParams();

	const [viewMode, setViewMode] = useState<ViewMode>(() => {
		const v = searchParams.get("view");
		return VALID_VIEWS.includes(v as ViewMode) ? (v as ViewMode) : "list";
	});
	const [selectedDate, setSelectedDate] = useState(() => {
		const d = searchParams.get("date");
		return d && /^\d{4}-\d{2}-\d{2}$/.test(d)
			? d
			: format(new Date(), "yyyy-MM-dd");
	});
	const [asUserId, setAsUserId] = useState<string | undefined>(undefined);
	const { data: session } = useSession();
	const canUseDevControls = IS_DEV && !session?.user.isImpersonating;
	const can = useCheckPermission();
	const canCheckin = can("clients:appointments:checkin");

	const todayStr = format(new Date(), "yyyy-MM-dd");

	useEffect(() => {
		const params = new URLSearchParams();
		if (viewMode !== "list") params.set("view", viewMode);
		if (selectedDate !== todayStr) params.set("date", selectedDate);
		const qs = params.toString();
		router.replace(qs ? `?${qs}` : "?", { scroll: false });
	}, [viewMode, selectedDate, todayStr, router]);

	const dateRange = useMemo(
		() => getDateRange(viewMode, selectedDate),
		[viewMode, selectedDate],
	);

	const todayInRange = dateRange.includes(todayStr);

	const { data: listData, isLoading: listLoading } =
		api.appointments.getDayAhead.useQuery(
			{
				asDate: selectedDate,
				asUserId: canUseDevControls ? asUserId : undefined,
			},
			{ enabled: viewMode === "list" },
		);
	const { data: greeterSchedule } = api.greeterProxy.getSchedule.useQuery(
		{ date: selectedDate },
		{ enabled: viewMode === "list" },
	);

	const { data: calData, isLoading: calLoading } =
		api.appointments.getCalendarRange.useQuery(
			{
				startDate: dateRange.at(0) ?? format(new Date(), "yyyy-MM-dd"),
				endDate: dateRange.at(-1) ?? format(new Date(), "yyyy-MM-dd"),
				asUserId: canUseDevControls ? asUserId : undefined,
			},
			{ enabled: viewMode !== "list" },
		);

	const { data: evaluatorCheckinsData } =
		api.appointments.getEvaluatorCheckins.useQuery(
			{
				startDate: dateRange.at(0) ?? format(new Date(), "yyyy-MM-dd"),
				endDate: dateRange.at(-1) ?? format(new Date(), "yyyy-MM-dd"),
			},
			{ enabled: viewMode === "day" },
		);
	const evaluatorCheckinsByNpi = useMemo(() => {
		const map = new Map<
			number,
			RouterOutputs["appointments"]["getEvaluatorCheckins"][number]
		>();
		for (const row of evaluatorCheckinsData ?? [])
			map.set(row.evaluatorNpi, row);
		return map;
	}, [evaluatorCheckinsData]);

	const colorMap = useMemo(() => buildColorMap(calData ?? []), [calData]);

	const can = useCheckPermission();
	const canSchedule = can("pages:scheduling");

	const evaluatorNpis = useMemo(
		() => [...new Set((calData ?? []).map((a) => a.evaluatorNpi))],
		[calData],
	);

	const { data: availabilityByNpi } =
		api.schedulingHelper.getAvailability.useQuery(
			{
				evaluatorNpis,
				start: new Date(`${dateRange[0] ?? todayStr}T00:00:00`),
				end: new Date(`${dateRange.at(-1) ?? todayStr}T23:59:59`),
			},
			{
				enabled: canSchedule && viewMode !== "list" && evaluatorNpis.length > 0,
			},
		);

	// Per-evaluator windows for the single-day view (one column per evaluator).
	const dayAvailability: AvailabilityWindow[] = useMemo(() => {
		if (viewMode !== "day" || !availabilityByNpi) return [];
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
					start: toFakeUtcDate(start),
					end: toFakeUtcDate(end),
				});
			}
		}
		return windows;
	}, [viewMode, availabilityByNpi, selectedDate]);

	// Evaluator-merged, per-date windows for the 3-day/week views, which mix
	// evaluators into shared lanes and can't place one person's slot precisely.
	const multiDayAvailability: DateAvailabilityWindow[] = useMemo(() => {
		if (viewMode !== "3day" && viewMode !== "week") return [];
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
					start: toFakeUtcDate(new Date(m.start)),
					end: toFakeUtcDate(new Date(m.end)),
				});
			}
		}
		return result;
	}, [viewMode, availabilityByNpi, dateRange]);

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

	const phoneNumbers = useMemo(() => {
		if (viewMode === "list") {
			return collectPhoneNumbers([
				...(listData?.myAppointments ?? []),
				...(listData?.offices ?? []).flatMap((office) =>
					office.evaluators.flatMap((ev) => ev.appointments),
				),
			]);
		}
		return collectPhoneNumbers(calData ?? []);
	}, [viewMode, listData, calData]);

	const { data: recentMessages, isLoading: messagesLoading } =
		api.quo.getRecentMessages.useQuery(
			{ phoneNumbers },
			{ enabled: phoneNumbers.length > 0 },
		);

	function navigate(dir: -1 | 1) {
		const anchor = new Date(`${selectedDate}T12:00:00`);
		setSelectedDate(
			format(addDays(anchor, dir * shiftAmount(viewMode)), "yyyy-MM-dd"),
		);
	}

	const displayDate = displayDateLabel(viewMode, dateRange);
	const isLoading = viewMode === "list" ? listLoading : calLoading;

	return (
		<TooltipProvider>
			<div className="flex h-full flex-col gap-4 overflow-auto p-6">
				{/* Header */}
				<div className="flex flex-wrap items-center gap-3">
					<div className="flex items-center gap-1">
						<Button
							className="h-7 w-7"
							onClick={() => navigate(-1)}
							size="icon"
							variant="ghost"
						>
							<ChevronLeft className="h-4 w-4" />
						</Button>
						<h1 className="min-w-44 text-center font-semibold text-lg">
							{displayDate}
						</h1>
						<Button
							className="h-7 w-7"
							onClick={() => navigate(1)}
							size="icon"
							variant="ghost"
						>
							<ChevronRight className="h-4 w-4" />
						</Button>
					</div>

					{!todayInRange && (
						<Button
							className="h-7 text-xs"
							onClick={() => setSelectedDate(todayStr)}
							size="sm"
							variant="outline"
						>
							Today
						</Button>
					)}

					<div className="ml-auto flex items-center gap-2">
						{canUseDevControls && (
							<DevControls asUserId={asUserId} onUserChange={setAsUserId} />
						)}
						<ToggleGroup
							onValueChange={(v) => v && setViewMode(v as ViewMode)}
							size="sm"
							spacing={0}
							type="single"
							value={viewMode}
							variant="outline"
						>
							<ToggleGroupItem value="list">List</ToggleGroupItem>
							<ToggleGroupItem value="day">Day</ToggleGroupItem>
							<ToggleGroupItem value="3day">3-Day</ToggleGroupItem>
							<ToggleGroupItem value="week">Week</ToggleGroupItem>
						</ToggleGroup>
					</div>
				</div>

				{/* Content */}
				{isLoading ? (
					<div className="text-muted-foreground text-sm">Loading...</div>
				) : viewMode === "list" ? (
					listData && (
						<ListContent
							asDate={selectedDate}
							canCheckin={canCheckin && selectedDate <= todayStr}
							data={listData}
							greeterSchedule={greeterSchedule}
							isToday={selectedDate === todayStr}
							messages={recentMessages ?? {}}
							messagesLoading={messagesLoading}
						/>
					)
				) : calData ? (
					viewMode === "day" ? (
						<CalendarDayView
							appointments={calData}
							canCheckin={canCheckin}
							availability={canSchedule ? dayAvailability : undefined}
							availabilityIntensity="light"
							colorMap={colorMap}
							evaluatorCheckinDate={selectedDate}
							evaluatorCheckins={
								canCheckin && selectedDate <= todayStr
									? evaluatorCheckinsByNpi
									: undefined
							}
							messages={recentMessages ?? {}}
							messagesLoading={messagesLoading}
							onSlotClick={canSchedule ? handleDaySlotClick : undefined}
						/>
					) : (
						<CalendarMultiDayView
							appointments={calData}
							canCheckin={canCheckin}
							availability={canSchedule ? multiDayAvailability : undefined}
							colorMap={colorMap}
							dates={dateRange}
							messages={recentMessages ?? {}}
							messagesLoading={messagesLoading}
							onSlotClick={canSchedule ? handleMultiDaySlotClick : undefined}
						/>
					)
				) : null}
			</div>
		</TooltipProvider>
	);
}

// ─── List content ─────────────────────────────────────────────────────────────

function ListContent({
	data,
	greeterSchedule,
	messages,
	messagesLoading,
	canCheckin,
	isToday,
	asDate,
}: {
	data: NonNullable<RouterOutputs["appointments"]["getDayAhead"]>;
	greeterSchedule: GreeterSchedule | undefined;
	messages: RecentMessagesMap;
	messagesLoading: boolean;
	canCheckin: boolean;
	isToday: boolean;
	asDate: string;
}) {
	const myFirst = data.myAppointments[0];
	const myLast = data.myAppointments.at(-1);
	const myTimeRange =
		myFirst && myLast
			? `${formatTime(myFirst.startTime)} – ${formatTime(myLast.endTime)}`
			: null;

	const myLocations = [
		...new Set(data.myAppointments.map((a) => a.officeName).filter(Boolean)),
	] as string[];
	const myGreeter =
		myLocations.length === 1 && myLocations[0]
			? findGreeter(greeterSchedule, myLocations[0])
			: null;

	const otherOffices = data.offices
		.map((office) => ({
			...office,
			evaluators: office.evaluators.filter((ev) => !ev.isCurrentUser),
		}))
		.filter((office) => office.evaluators.length > 0)
		.sort((a, b) => (a.officeName ?? "").localeCompare(b.officeName ?? ""));

	return (
		<>
			<section>
				<div className="mb-3 flex items-center gap-3">
					<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
						Your Day
					</h2>
					{myTimeRange && (
						<span className="text-muted-foreground text-xs tabular-nums">
							{myTimeRange}
						</span>
					)}
				</div>
				<GreeterLine greeter={myGreeter} />
				{!data.hasEvaluatorAccount ? (
					<p className="text-muted-foreground text-sm">
						Your account is not linked to an evaluator profile.
					</p>
				) : data.myAppointments.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No appointments scheduled for this day.
					</p>
				) : (
					<div className="divide-y divide-border">
						{data.myAppointments.map((appt) => (
							<AppointmentRow
								appt={appt}
								canCheckin={canCheckin}
								isToday={isToday}
								key={appt.id}
								messages={messages}
								messagesLoading={messagesLoading}
							/>
						))}
					</div>
				)}
			</section>

			<Separator />

			<section>
				<h2 className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
					Who&apos;s In
				</h2>
				{otherOffices.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No one else has appointments today.
					</p>
				) : (
					<div className="flex flex-col gap-6">
						{otherOffices.map((office) => (
							<div key={office.locationKey}>
								<div className="mb-2 flex items-center justify-between gap-2">
									<h3 className="font-medium">
										{office.officeName && office.officeName !== "Unknown Office"
											? office.officeName
											: "Virtual"}
									</h3>
									<GreeterInline
										greeter={findGreeter(greeterSchedule, office.officeName)}
									/>
								</div>
								<div className="flex flex-col">
									{office.evaluators.map((ev) => (
										<EvaluatorRow
											asDate={asDate}
											canCheckin={canCheckin}
											evaluator={ev}
											isToday={isToday}
											key={ev.npi}
											messages={messages}
											messagesLoading={messagesLoading}
										/>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</section>
		</>
	);
}

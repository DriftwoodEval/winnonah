"use client";

import { Badge } from "@ui/badge";
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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/tooltip";
import { addDays, format, startOfWeek } from "date-fns";
import { Armchair, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getLocalTimeFromUTCDate } from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";

const IS_DEV = process.env.NODE_ENV === "development";

// ─── Calendar grid constants ──────────────────────────────────────────────────

const HOUR_HEIGHT = 64;
const DAY_START = 7;
const DAY_END = 20;
const GRID_PADDING = 12; // px above/below grid so first/last labels aren't clipped
const TOTAL_HEIGHT = (DAY_END - DAY_START) * HOUR_HEIGHT + GRID_PADDING * 2;
const GRID_HOURS = Array.from(
	{ length: DAY_END - DAY_START + 1 },
	(_, i) => DAY_START + i,
);

// Left-border accent colors per evaluator. Must be complete Tailwind strings.
const EVAL_COLORS = [
	"border-l-blue-400 bg-blue-50 dark:bg-blue-950/30",
	"border-l-emerald-400 bg-emerald-50 dark:bg-emerald-950/30",
	"border-l-violet-400 bg-violet-50 dark:bg-violet-950/30",
	"border-l-amber-400 bg-amber-50 dark:bg-amber-950/30",
	"border-l-rose-400 bg-rose-50 dark:bg-rose-950/30",
	"border-l-cyan-400 bg-cyan-50 dark:bg-cyan-950/30",
	"border-l-orange-400 bg-orange-50 dark:bg-orange-950/30",
	"border-l-teal-400 bg-teal-50 dark:bg-teal-950/30",
];
const FALLBACK_COLOR = EVAL_COLORS[0] ?? "";

type ViewMode = "list" | "day" | "3day" | "week";

// ─── Time helpers ─────────────────────────────────────────────────────────────

function localDate(utcDate: Date): Date {
	return getLocalTimeFromUTCDate(utcDate) ?? new Date(utcDate);
}

function formatTime(utcDate: Date): string {
	return format(localDate(new Date(utcDate)), "h:mm a");
}

function apptDateKey(startTime: Date): string {
	return format(localDate(new Date(startTime)), "yyyy-MM-dd");
}

function minutesFromMidnight(utcDate: Date): number {
	const d = localDate(new Date(utcDate));
	return d.getHours() * 60 + d.getMinutes();
}

function blockTop(startTime: Date): number {
	const mins = minutesFromMidnight(new Date(startTime));
	return Math.max(
		GRID_PADDING,
		((mins - DAY_START * 60) / 60) * HOUR_HEIGHT + GRID_PADDING,
	);
}

function blockHeight(startTime: Date, endTime: Date): number {
	const durMin =
		(new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000;
	return Math.max((durMin / 60) * HOUR_HEIGHT, 24);
}

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
	locationKey?: string | null;
	officeName?: string | null;
	confirmedAt?: Date | null;
	calendarEventTitle?: string | null;
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
	confirmedAt: Date | null;
};

// ─── List view components ─────────────────────────────────────────────────────

function AppointmentRow({ appt }: { appt: ListAppt }) {
	return (
		<div className="flex items-center gap-3 py-2">
			<span className="w-36 shrink-0 text-muted-foreground text-sm tabular-nums">
				{formatTime(appt.startTime)} – {formatTime(appt.endTime)}
			</span>
			<Link
				className="truncate font-medium hover:text-secondary"
				href={`/clients/${appt.clientHash}`}
			>
				{appt.clientName}
			</Link>
			{appt.clientDriveId && appt.clientDriveId !== "N/A" && (
				<Link
					className="shrink-0"
					href={`https://drive.google.com/open?id=${appt.clientDriveId}`}
					target="_blank"
				>
					<Image
						alt="Google Drive"
						className="dark:invert"
						height={14}
						src="/icons/google-drive.svg"
						width={14}
					/>
				</Link>
			)}
			{appt.clientTaHash && (
				<Link
					className="shrink-0 text-muted-foreground hover:text-foreground"
					href={`https://api.portal.therapyappointment.com/n/client/${appt.clientTaHash}`}
					target="_blank"
				>
					<Armchair height="14" width="14" />
				</Link>
			)}
			{appt.asdAdhd && (
				<Badge className="shrink-0" variant="outline">
					{appt.asdAdhd}
				</Badge>
			)}
			{appt.daEval && (
				<Badge className="shrink-0" variant="outline">
					{appt.daEval}
				</Badge>
			)}
			{appt.confirmedAt && (
				<Badge className="h-4 shrink-0 px-1 text-[9px] uppercase">
					Confirmed
				</Badge>
			)}
			<span className="ml-auto shrink-0 text-muted-foreground text-xs">
				{appt.officeName ?? appt.locationKey ?? "Virtual"}
			</span>
		</div>
	);
}

function EvaluatorRow({
	evaluator,
}: {
	evaluator: {
		name: string;
		npi: number;
		isCurrentUser: boolean;
		appointments: ListEvaluatorAppt[];
	};
}) {
	const [open, setOpen] = useState(false);

	const first = evaluator.appointments[0];
	const last = evaluator.appointments[evaluator.appointments.length - 1];
	const timeRange =
		first && last
			? `${formatTime(first.startTime)} – ${formatTime(last.endTime)}`
			: null;

	return (
		<Collapsible onOpenChange={setOpen} open={open}>
			<CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2 py-1.5 text-left hover:opacity-80">
				{open ? (
					<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				) : (
					<ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				)}
				<span className={evaluator.isCurrentUser ? "font-semibold" : ""}>
					{evaluator.name}
				</span>
				<span className="text-muted-foreground text-xs">
					{evaluator.appointments.length} appt
					{evaluator.appointments.length !== 1 ? "s" : ""}
				</span>
				{timeRange && (
					<span className="ml-auto shrink-0 text-muted-foreground text-xs tabular-nums">
						{timeRange}
					</span>
				)}
			</CollapsibleTrigger>
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
								{appt.clientName}
							</Link>
							{appt.clientDriveId && appt.clientDriveId !== "N/A" && (
								<Link
									className="shrink-0"
									href={`https://drive.google.com/open?id=${appt.clientDriveId}`}
									target="_blank"
								>
									<Image
										alt="Google Drive"
										className="dark:invert"
										height={12}
										src="/icons/google-drive.svg"
										width={12}
									/>
								</Link>
							)}
							{appt.clientTaHash && (
								<Link
									className="shrink-0 text-muted-foreground hover:text-foreground"
									href={`https://api.portal.therapyappointment.com/n/client/${appt.clientTaHash}`}
									target="_blank"
								>
									<Armchair height="12" width="12" />
								</Link>
							)}
							{appt.asdAdhd && (
								<Badge className="shrink-0 text-xs" variant="outline">
									{appt.asdAdhd}
								</Badge>
							)}
							{appt.daEval && (
								<Badge className="shrink-0 text-xs" variant="outline">
									{appt.daEval}
								</Badge>
							)}
							{appt.confirmedAt && (
								<Badge className="h-4 shrink-0 px-1 text-[9px] uppercase">
									Confirmed
								</Badge>
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

// ─── Calendar appointment block ────────────────────────────────────────────────

type CalAppt = {
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

function ApptBlock({
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
				{showEvaluator && <p className="opacity-80">{appt.evaluatorName}</p>}
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

// ─── Time gutter ──────────────────────────────────────────────────────────────

function TimeGutter() {
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

function GridLines() {
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

// ─── Overlap lane assignment ───────────────────────────────────────────────────

function assignLanes<T extends { startTime: Date; endTime: Date }>(
	appts: T[],
): { appt: T; lane: number; totalLanes: number }[] {
	const sorted = [...appts].sort(
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

// ─── Calendar day view (evaluator columns) ────────────────────────────────────

function CalendarDayView({
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
		return [...map.values()].sort((a, b) => {
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

// ─── Calendar multi-day view (date columns, fill full width) ──────────────────

function CalendarMultiDayView({
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
			{/* Date headers */}
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
			{/* Grid */}
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

	// List query — pass selectedDate so date navigation works
	const { data: listData, isLoading: listLoading } =
		api.appointments.getDayAhead.useQuery(
			{
				asDate: selectedDate,
				asUserId: IS_DEV ? asUserId : undefined,
			},
			{ enabled: viewMode === "list" },
		);

	// Calendar query
	const { data: calData, isLoading: calLoading } =
		api.appointments.getCalendarRange.useQuery(
			{
				startDate: dateRange.at(0) ?? format(new Date(), "yyyy-MM-dd"),
				endDate: dateRange.at(-1) ?? format(new Date(), "yyyy-MM-dd"),
				asUserId: IS_DEV ? asUserId : undefined,
			},
			{ enabled: viewMode !== "list" },
		);

	// Assign deterministic colors: deduplicate by NPI, sort current user first then by NPI
	const colorMap = useMemo<Map<number, string>>(() => {
		const map = new Map<number, string>();
		if (!calData) return map;
		const byNpi = new Map<number, boolean>();
		for (const a of calData) {
			if (!byNpi.has(a.evaluatorNpi))
				byNpi.set(a.evaluatorNpi, a.isCurrentUser);
		}
		const sorted = [...byNpi.entries()].sort(([npiA, currA], [npiB, currB]) => {
			if (currA && !currB) return -1;
			if (!currA && currB) return 1;
			return npiA - npiB;
		});
		sorted.forEach(([npi], i) => {
			map.set(npi, EVAL_COLORS[i % EVAL_COLORS.length] ?? FALLBACK_COLOR);
		});
		return map;
	}, [calData]);

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
						{IS_DEV && (
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
					listData && <ListContent data={listData} />
				) : calData ? (
					viewMode === "day" ? (
						<CalendarDayView appointments={calData} colorMap={colorMap} />
					) : (
						<CalendarMultiDayView
							appointments={calData}
							colorMap={colorMap}
							dates={dateRange}
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
}: {
	data: NonNullable<RouterOutputs["appointments"]["getDayAhead"]>;
}) {
	const myFirst = data.myAppointments[0];
	const myLast = data.myAppointments[data.myAppointments.length - 1];
	const myTimeRange =
		myFirst && myLast
			? `${formatTime(myFirst.startTime)} – ${formatTime(myLast.endTime)}`
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
							<AppointmentRow appt={appt} key={appt.id} />
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
								<h3 className="mb-2 font-medium">
									{office.officeName && office.officeName !== "Unknown Office"
										? office.officeName
										: "Virtual"}
								</h3>
								<div className="flex flex-col">
									{office.evaluators.map((ev) => (
										<EvaluatorRow evaluator={ev} key={ev.npi} />
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

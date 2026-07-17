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
import { TooltipProvider } from "@ui/tooltip";
import { addDays, format, startOfWeek } from "date-fns";
import { Armchair, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { api, type RouterOutputs } from "~/trpc/react";
import { Redact } from "../redaction/Redact";
import {
	buildColorMap,
	CalendarDayView,
	CalendarMultiDayView,
	formatTime,
} from "./CalendarGrid";

const IS_DEV = process.env.NODE_ENV === "development";

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
				<Redact>{appt.clientName}</Redact>
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
	const last = evaluator.appointments.at(-1);
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
								<Redact>{appt.clientName}</Redact>
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

	const { data: calData, isLoading: calLoading } =
		api.appointments.getCalendarRange.useQuery(
			{
				startDate: dateRange.at(0) ?? format(new Date(), "yyyy-MM-dd"),
				endDate: dateRange.at(-1) ?? format(new Date(), "yyyy-MM-dd"),
				asUserId: canUseDevControls ? asUserId : undefined,
			},
			{ enabled: viewMode !== "list" },
		);

	const colorMap = useMemo(() => buildColorMap(calData ?? []), [calData]);

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
	const myLast = data.myAppointments.at(-1);
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

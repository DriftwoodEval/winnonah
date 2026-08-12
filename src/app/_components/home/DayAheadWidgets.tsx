"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@ui/collapsible";
import { addDays, format } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
	formatInBusinessTime,
	formatPhoneNumber,
	normalizePhoneNumber,
} from "~/lib/utils";
import { api, type RouterOutputs } from "~/trpc/react";
import { RecentMessagesPopover } from "../day-ahead/RecentMessagesPopover";
import { Redact } from "../redaction/Redact";

type RecentMessagesMap = RouterOutputs["quo"]["getRecentMessages"];
type GreeterSchedule = RouterOutputs["greeterProxy"]["getSchedule"];

export function todayStr() {
	return format(new Date(), "yyyy-MM-dd");
}

function findGreeter(
	schedule: GreeterSchedule | undefined,
	officeName: string | null,
) {
	if (!schedule || !officeName) return null;
	const norm = officeName.trim().toLowerCase();
	const match = schedule.find((entry) => {
		const loc = entry.location.trim().toLowerCase();
		return loc === norm || loc.includes(norm) || norm.includes(loc);
	});
	return match ?? null;
}

function GreeterLine({
	greeter,
}: {
	greeter: { name: string; phone: string | null } | null;
}) {
	if (!greeter) return null;
	return (
		<div className="mb-2 flex items-center gap-1.5 border-b pb-2 text-xs">
			<span className="text-muted-foreground">Greeter:</span>
			<span className="font-medium">
				<Redact>{greeter.name}</Redact>
			</span>
			{greeter.phone && (
				<a
					className="text-secondary hover:underline"
					href={`tel:${greeter.phone}`}
				>
					<Redact>{formatPhoneNumber(greeter.phone)}</Redact>
				</a>
			)}
		</div>
	);
}

export function useSelectedDate() {
	const [date, setDate] = useState(todayStr);
	const shift = (dir: -1 | 1) => {
		setDate((d) =>
			format(addDays(new Date(`${d}T12:00:00`), dir), "yyyy-MM-dd"),
		);
	};
	return { date, shift, resetToToday: () => setDate(todayStr()) };
}

function formatTime(date: Date) {
	return formatInBusinessTime(date, "h:mm a");
}

export function DayNav({
	date,
	onShift,
	onToday,
}: {
	date: string;
	onShift: (dir: -1 | 1) => void;
	onToday: () => void;
}) {
	const isToday = date === todayStr();
	return (
		<div className="ml-auto flex shrink-0 items-center gap-1">
			{!isToday && (
				<Button
					className="h-6 px-2 text-xs"
					onClick={onToday}
					size="sm"
					variant="outline"
				>
					Today
				</Button>
			)}
			<span className="text-muted-foreground text-xs tabular-nums">
				{format(new Date(`${date}T12:00:00`), "EEE, MMM d")}
			</span>
			<Button
				className="h-6 w-6"
				onClick={() => onShift(-1)}
				size="icon"
				variant="ghost"
			>
				<ChevronLeft className="h-3.5 w-3.5" />
			</Button>
			<Button
				className="h-6 w-6"
				onClick={() => onShift(1)}
				size="icon"
				variant="ghost"
			>
				<ChevronRight className="h-3.5 w-3.5" />
			</Button>
		</div>
	);
}

export function WidgetShell({
	title,
	nav,
	children,
}: {
	title: string;
	nav?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col overflow-hidden">
			<div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
				<h2 className="truncate font-semibold text-sm">{title}</h2>
				{nav}
			</div>
			<div className="overflow-auto px-4 py-2">{children}</div>
		</div>
	);
}

export function MyDayWidget() {
	const { date: asDate, shift, resetToToday } = useSelectedDate();
	const { data, isLoading } = api.appointments.getDayAhead.useQuery({ asDate });
	const { data: greeterSchedule } = api.greeterProxy.getSchedule.useQuery({
		date: asDate,
	});

	const appts = data?.myAppointments ?? [];

	const phoneNumbers = useMemo(
		() => [
			...new Set(
				appts.map((a) => a.clientPhone).filter((p): p is string => !!p),
			),
		],
		[appts],
	);
	const { data: recentMessages, isLoading: messagesLoading } =
		api.quo.getRecentMessages.useQuery(
			{ phoneNumbers },
			{ enabled: phoneNumbers.length > 0 },
		);

	const myFirst = appts[0];
	const myLast = appts.at(-1);
	const myTimeRange =
		myFirst && myLast
			? `${formatTime(myFirst.startTime)} – ${formatTime(myLast.endTime)}`
			: null;

	const uniqueLocations = [
		...new Set(appts.map((a) => a.officeName).filter(Boolean)),
	] as string[];
	const allSameLocation = uniqueLocations.length <= 1;
	const locationSuffix =
		uniqueLocations.length > 0 ? uniqueLocations.join(", ") : null;

	const titleParts = ["My Day", myTimeRange, locationSuffix].filter(Boolean);
	const greeter =
		allSameLocation && uniqueLocations[0]
			? findGreeter(greeterSchedule, uniqueLocations[0])
			: null;

	return (
		<WidgetShell
			nav={<DayNav date={asDate} onShift={shift} onToday={resetToToday} />}
			title={titleParts.join(" · ")}
		>
			<GreeterLine greeter={greeter} />
			{isLoading ? (
				<p className="text-muted-foreground text-sm">Loading...</p>
			) : !data ? null : !data.hasEvaluatorAccount ? (
				<p className="text-muted-foreground text-sm">
					No evaluator profile linked.
				</p>
			) : appts.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No appointments {asDate === todayStr() ? "today" : "this day"}.
				</p>
			) : (
				<div className="divide-y divide-border">
					{appts.map((appt) => (
						<div
							className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2"
							key={appt.id}
						>
							<span className="shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums">
								{formatTime(appt.startTime)} – {formatTime(appt.endTime)}
							</span>
							<Link
								className="min-w-32 flex-1 truncate font-medium text-sm hover:text-secondary"
								href={`/clients/${appt.clientHash}`}
							>
								<Redact>{appt.clientName}</Redact>
							</Link>
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
							{appt.confirmedAt ? (
								<Badge className="h-4 shrink-0 px-1 text-[9px] uppercase">
									Confirmed
								</Badge>
							) : (
								<Badge
									className="h-4 shrink-0 px-1 text-[9px] uppercase"
									variant="destructive"
								>
									Unconfirmed
								</Badge>
							)}
							<RecentMessagesPopover
								appointmentStart={appt.startTime}
								isLoading={messagesLoading}
								messages={
									appt.clientPhone
										? recentMessages?.[normalizePhoneNumber(appt.clientPhone)]
										: undefined
								}
								phoneNumber={appt.clientPhone}
							/>
							{!allSameLocation && appt.officeName && (
								<span className="ml-auto shrink-0 text-muted-foreground text-xs">
									{appt.officeName}
								</span>
							)}
						</div>
					))}
				</div>
			)}
		</WidgetShell>
	);
}

export function WhosInWidget() {
	const { date: asDate, shift, resetToToday } = useSelectedDate();
	const { data, isLoading } = api.appointments.getDayAhead.useQuery({ asDate });
	const { data: greeterSchedule } = api.greeterProxy.getSchedule.useQuery({
		date: asDate,
	});

	const otherOffices = (data?.offices ?? [])
		.map((office) => ({
			...office,
			evaluators: office.evaluators.filter((ev) => !ev.isCurrentUser),
		}))
		.filter((office) => office.evaluators.length > 0)
		.sort((a, b) => (a.officeName ?? "").localeCompare(b.officeName ?? ""));

	const phoneNumbers = useMemo(() => {
		const phones = new Set<string>();
		for (const office of otherOffices) {
			for (const ev of office.evaluators) {
				for (const appt of ev.appointments) {
					if (appt.clientPhone) phones.add(appt.clientPhone);
				}
			}
		}
		return [...phones];
	}, [otherOffices]);
	const { data: recentMessages, isLoading: messagesLoading } =
		api.quo.getRecentMessages.useQuery(
			{ phoneNumbers },
			{ enabled: phoneNumbers.length > 0 },
		);

	return (
		<WidgetShell
			nav={<DayNav date={asDate} onShift={shift} onToday={resetToToday} />}
			title="Who's In"
		>
			{isLoading ? (
				<p className="text-muted-foreground text-sm">Loading...</p>
			) : otherOffices.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No one else has appointments{" "}
					{asDate === todayStr() ? "today" : "this day"}.
				</p>
			) : (
				<div className="flex flex-col gap-4">
					{otherOffices.map((office) => (
						<div key={office.locationKey}>
							<div className="mb-1 flex items-center justify-between gap-2">
								<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
									{office.officeName}
								</p>
								{(() => {
									const greeter = findGreeter(
										greeterSchedule,
										office.officeName,
									);
									if (!greeter) return null;
									return (
										<span className="shrink-0 text-muted-foreground text-xs normal-case">
											<Redact>{greeter.name}</Redact>
											{greeter.phone && (
												<>
													{" · "}
													<a
														className="text-secondary hover:underline"
														href={`tel:${greeter.phone}`}
													>
														<Redact>{formatPhoneNumber(greeter.phone)}</Redact>
													</a>
												</>
											)}
										</span>
									);
								})()}
							</div>
							{office.evaluators.map((ev) => (
								<ExpandableEvaluator
									evaluator={ev}
									key={ev.npi}
									messages={recentMessages ?? {}}
									messagesLoading={messagesLoading}
								/>
							))}
						</div>
					))}
				</div>
			)}
		</WidgetShell>
	);
}

function ExpandableEvaluator({
	evaluator,
	messages,
	messagesLoading,
}: {
	evaluator: {
		name: string;
		npi: number;
		isCurrentUser: boolean;
		appointments: {
			id: string;
			startTime: Date;
			endTime: Date;
			daEval: string | null;
			asdAdhd: string | null;
			confirmedAt: Date | null;
			clientName: string;
			clientHash: string;
			clientPhone: string | null;
		}[];
	};
	messages: RecentMessagesMap;
	messagesLoading: boolean;
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
			<CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-1.5 py-1 text-left hover:opacity-80">
				{open ? (
					<ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
				) : (
					<ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
				)}
				<span
					className={`truncate text-sm ${evaluator.isCurrentUser ? "font-semibold" : ""}`}
				>
					<Redact>{evaluator.name}</Redact>
				</span>
				<span className="shrink-0 text-muted-foreground text-xs">
					{evaluator.appointments.length}
				</span>
				{timeRange && (
					<span className="ml-auto shrink-0 text-muted-foreground text-xs tabular-nums">
						{timeRange}
					</span>
				)}
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="ml-6 border-border border-l pl-3">
					{evaluator.appointments.map((appt) => (
						<div
							className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5"
							key={appt.id}
						>
							<span className="shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums">
								{formatTime(appt.startTime)} – {formatTime(appt.endTime)}
							</span>
							<Link
								className="min-w-32 flex-1 truncate text-xs hover:text-secondary"
								href={`/clients/${appt.clientHash}`}
							>
								<Redact>{appt.clientName}</Redact>
							</Link>
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
							{appt.confirmedAt ? (
								<Badge className="h-4 shrink-0 px-1 text-[9px] uppercase">
									Confirmed
								</Badge>
							) : (
								<Badge
									className="h-4 shrink-0 px-1 text-[9px] uppercase"
									variant="destructive"
								>
									Unconfirmed
								</Badge>
							)}
							<RecentMessagesPopover
								appointmentStart={appt.startTime}
								isLoading={messagesLoading}
								messages={
									appt.clientPhone
										? messages[normalizePhoneNumber(appt.clientPhone)]
										: undefined
								}
								phoneNumber={appt.clientPhone}
							/>
						</div>
					))}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

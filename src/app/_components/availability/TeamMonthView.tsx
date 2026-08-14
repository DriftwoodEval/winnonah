"use client";

import { Button } from "@ui/button";
import { Label } from "@ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { Skeleton } from "@ui/skeleton";
import { Switch } from "@ui/switch";
import {
	add,
	eachDayOfInterval,
	endOfMonth,
	endOfWeek,
	format,
	isSameDay,
	isSameMonth,
	startOfDay,
	startOfMonth,
	startOfWeek,
	sub,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

type CalendarEvent = {
	id?: string | null;
	summary?: string | null;
	start: string | Date;
	end: string | Date;
	isUnavailability: boolean;
	isAllDay: boolean;
	officeKeys?: string[];
};

type PersonEntry = {
	key: string;
	email: string;
	name: string;
	summary: string;
	isUnavailability: boolean;
	officeKeys: string[];
};

type DayMap = Record<string, PersonEntry[]>;

const MAX_VISIBLE_ENTRIES = 3;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDate(value: string | Date): Date {
	return value instanceof Date ? value : new Date(value);
}

function buildDayMap(
	people: { email: string; name: string | null; events: CalendarEvent[] }[],
	hideOutOfOffice: boolean,
): DayMap {
	const map: DayMap = {};

	for (const person of people) {
		for (const event of person.events) {
			if (hideOutOfOffice && event.isUnavailability) continue;

			// Only count "available" events that actually list an office;
			// matches the same officeKeys extraction used everywhere else.
			if (!event.isUnavailability && !event.officeKeys?.length) continue;

			const start = toDate(event.start);
			const end = toDate(event.end);
			const intervalEnd = event.isAllDay ? sub(end, { seconds: 1 }) : end;

			const days = eachDayOfInterval({
				start: startOfDay(start),
				end: startOfDay(intervalEnd),
			});

			for (const day of days) {
				const key = format(day, "yyyy-MM-dd");
				if (!map[key]) map[key] = [];
				map[key].push({
					key: `${person.email}-${event.id ?? `${event.start}`}`,
					email: person.email,
					name: person.name ?? person.email,
					summary: event.summary ?? "",
					isUnavailability: event.isUnavailability,
					officeKeys: event.officeKeys ?? [],
				});
			}
		}
	}

	return map;
}

function PersonBadge({
	entry,
	officeNames,
}: {
	entry: PersonEntry;
	officeNames: Map<string, string>;
}) {
	const offices = entry.officeKeys
		.map((key) => officeNames.get(key))
		.filter((name): name is string => !!name);

	return (
		<div
			className={cn(
				"truncate rounded px-1.5 py-0.5 text-[10px] leading-tight",
				entry.isUnavailability
					? "bg-destructive text-destructive-foreground"
					: "bg-primary/15 text-primary",
			)}
			title={`${entry.name}: ${entry.summary}`}
		>
			{entry.name}
			{offices.length > 0 && (
				<span className="opacity-80"> · {offices.join(", ")}</span>
			)}
		</div>
	);
}

function DayCell({
	day,
	month,
	entries,
	officeNames,
}: {
	day: Date;
	month: Date;
	entries: PersonEntry[];
	officeNames: Map<string, string>;
}) {
	const inMonth = isSameMonth(day, month);
	const today = isSameDay(day, new Date());
	const visible = entries.slice(0, MAX_VISIBLE_ENTRIES);
	const overflow = entries.length - visible.length;

	return (
		<div
			className={cn(
				"flex min-h-[110px] flex-col gap-1 border-r border-b p-1.5 last:border-r-0",
				!inMonth && "bg-muted/30",
			)}
		>
			<span
				className={cn(
					"flex h-6 w-6 items-center justify-center self-end rounded-full font-medium text-xs",
					!inMonth && "text-muted-foreground",
					today && "bg-primary text-primary-foreground",
				)}
			>
				{format(day, "d")}
			</span>

			<div className="flex flex-col gap-1">
				{visible.map((entry) => (
					<PersonBadge
						entry={entry}
						key={entry.key}
						officeNames={officeNames}
					/>
				))}

				{overflow > 0 && (
					<Popover>
						<PopoverTrigger asChild>
							<button
								className="cursor-pointer text-left text-[10px] text-muted-foreground hover:underline"
								type="button"
							>
								+{overflow} more
							</button>
						</PopoverTrigger>
						<PopoverContent className="w-64">
							<p className="mb-1 font-medium text-sm">
								{format(day, "MMMM d, yyyy")}
							</p>
							<div className="flex flex-col gap-1">
								{entries.map((entry) => (
									<PersonBadge
										entry={entry}
										key={entry.key}
										officeNames={officeNames}
									/>
								))}
							</div>
						</PopoverContent>
					</Popover>
				)}
			</div>
		</div>
	);
}

function MonthGridLoading() {
	return (
		<div className="grid grid-cols-7">
			{Array.from({ length: 35 }).map((_, i) => (
				<div
					className="min-h-[110px] border-r border-b p-1.5 last:border-r-0"
					// biome-ignore lint/suspicious/noArrayIndexKey: just a skeleton
					key={i}
				>
					<Skeleton className="h-16 w-full" />
				</div>
			))}
		</div>
	);
}

export function TeamMonthView() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const [month, setMonth] = useState(() => startOfMonth(new Date()));

	const urlHideOoo = searchParams.get("hideOoo") === "true";
	const [hideOutOfOffice, setHideOutOfOfficeState] = useState(urlHideOoo);

	useEffect(() => {
		setHideOutOfOfficeState(urlHideOoo);
	}, [urlHideOoo]);

	const setHideOutOfOffice = (value: boolean) => {
		setHideOutOfOfficeState(value);
		const params = new URLSearchParams(searchParams.toString());
		if (value) {
			params.set("hideOoo", "true");
		} else {
			params.delete("hideOoo");
		}
		router.push(`${pathname}?${params.toString()}`);
	};

	const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
	const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
	const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

	const { data, isLoading } = api.google.getTeamAvailability.useQuery({
		startDate: gridStart,
		endDate: add(gridEnd, { days: 1 }),
	});
	const { data: offices } = api.offices.getAll.useQuery();

	const officeNames = new Map(
		(offices ?? []).map((o) => [o.key, o.prettyName] as const),
	);
	officeNames.set("VIRTUAL", "Virtual");

	const dayMap = data ? buildDayMap(data, hideOutOfOffice) : {};

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<Button
						className="cursor-pointer"
						onClick={() => setMonth((m) => sub(m, { months: 1 }))}
						size="icon"
						variant="outline"
					>
						<ChevronLeft aria-label="Previous month" className="h-4 w-4" />
					</Button>
					<div className="min-w-[160px] text-center font-medium">
						{format(month, "MMMM yyyy")}
					</div>
					<Button
						className="cursor-pointer"
						onClick={() => setMonth((m) => add(m, { months: 1 }))}
						size="icon"
						variant="outline"
					>
						<ChevronRight aria-label="Next month" className="h-4 w-4" />
					</Button>
					{!isSameMonth(month, new Date()) && (
						<Button
							className="cursor-pointer"
							onClick={() => setMonth(startOfMonth(new Date()))}
							variant="outline"
						>
							Today
						</Button>
					)}
				</div>

				<div className="flex items-center gap-2">
					<Switch
						checked={hideOutOfOffice}
						id="hide-ooo"
						onCheckedChange={setHideOutOfOffice}
					/>
					<Label className="cursor-pointer" htmlFor="hide-ooo">
						Hide out of office
					</Label>
				</div>
			</div>

			{isLoading ? (
				<MonthGridLoading />
			) : (
				<div className="overflow-hidden rounded-md border">
					<div className="grid grid-cols-7 border-b bg-muted/30">
						{WEEKDAY_LABELS.map((label) => (
							<div
								className="p-2 text-center font-medium text-muted-foreground text-xs"
								key={label}
							>
								{label}
							</div>
						))}
					</div>
					<div className="grid grid-cols-7">
						{days.map((day) => {
							const key = format(day, "yyyy-MM-dd");
							return (
								<DayCell
									day={day}
									entries={dayMap[key] ?? []}
									key={key}
									month={month}
									officeNames={officeNames}
								/>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}

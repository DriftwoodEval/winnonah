"use client";

import { Badge } from "@ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@ui/collapsible";
import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "~/trpc/react";

function formatTime(date: Date) {
	return new Date(date).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
		timeZone: "UTC",
	});
}

function WidgetShell({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col overflow-hidden">
			<div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
				<h2 className="font-semibold text-sm">{title}</h2>
			</div>
			<div className="overflow-auto px-4 py-2">{children}</div>
		</div>
	);
}

export function MyDayWidget() {
	const { data, isLoading } = api.appointments.getDayAhead.useQuery(undefined);

	const appts = data?.myAppointments ?? [];
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

	return (
		<WidgetShell title={titleParts.join(" · ")}>
			{isLoading ? (
				<p className="text-muted-foreground text-sm">Loading...</p>
			) : !data ? null : !data.hasEvaluatorAccount ? (
				<p className="text-muted-foreground text-sm">
					No evaluator profile linked.
				</p>
			) : appts.length === 0 ? (
				<p className="text-muted-foreground text-sm">No appointments today.</p>
			) : (
				<div className="divide-y divide-border">
					{appts.map((appt) => (
						<div className="flex items-center gap-2 py-1.5" key={appt.id}>
							<span className="shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums">
								{formatTime(appt.startTime)} – {formatTime(appt.endTime)}
							</span>
							<Link
								className="truncate font-medium text-sm hover:text-secondary"
								href={`/clients/${appt.clientHash}`}
							>
								{appt.clientName}
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
	const { data, isLoading } = api.appointments.getDayAhead.useQuery(undefined);

	const otherOffices = (data?.offices ?? [])
		.map((office) => ({
			...office,
			evaluators: office.evaluators.filter((ev) => !ev.isCurrentUser),
		}))
		.filter((office) => office.evaluators.length > 0)
		.sort((a, b) => (a.officeName ?? "").localeCompare(b.officeName ?? ""));

	return (
		<WidgetShell title="Who's In">
			{isLoading ? (
				<p className="text-muted-foreground text-sm">Loading...</p>
			) : otherOffices.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					No one else has appointments today.
				</p>
			) : (
				<div className="flex flex-col gap-4">
					{otherOffices.map((office) => (
						<div key={office.locationKey}>
							<p className="mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
								{office.officeName}
							</p>
							{office.evaluators.map((ev) => (
								<ExpandableEvaluator evaluator={ev} key={ev.npi} />
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
		}[];
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
			<CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-1.5 py-1 text-left hover:opacity-80">
				{open ? (
					<ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
				) : (
					<ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
				)}
				<span
					className={`truncate text-sm ${evaluator.isCurrentUser ? "font-semibold" : ""}`}
				>
					{evaluator.name}
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
						<div className="flex items-center gap-2 py-1" key={appt.id}>
							<span className="shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums">
								{formatTime(appt.startTime)} – {formatTime(appt.endTime)}
							</span>
							<Link
								className="truncate text-xs hover:text-secondary"
								href={`/clients/${appt.clientHash}`}
							>
								{appt.clientName}
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
						</div>
					))}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

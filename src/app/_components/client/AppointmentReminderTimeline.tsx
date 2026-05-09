"use client";

import { Skeleton } from "@ui/skeleton";
import { format, formatDistanceToNow } from "date-fns";
import { api } from "~/trpc/react";

export function AppointmentReminderTimeline({
	appointmentId,
}: {
	appointmentId: string;
}) {
	const { data, isLoading } = api.appointments.getReminderTimeline.useQuery({
		appointmentId,
	});

	if (isLoading)
		return (
			<div className="space-y-1.5 px-1">
				<Skeleton className="h-3 w-3/4" />
				<Skeleton className="h-3 w-1/2" />
			</div>
		);

	const isEmpty = !data?.sent.length && !data?.pending.length;

	if (isEmpty)
		return (
			<p className="px-1 text-[10px] text-muted-foreground italic">
				No reminders sent or scheduled.
			</p>
		);

	return (
		<div className="relative ml-1 space-y-2 border-border border-l pl-3">
			{data.sent.map((item) => (
				<div
					className="relative"
					key={`sent-${item.templateId}-${item.sentAt.getTime()}`}
				>
					<span className="absolute top-1 -left-[17px] h-2 w-2 rounded-full bg-primary" />
					<p className="font-medium text-[10px] leading-tight">
						{item.templateName}
					</p>
					<p
						className="text-[10px] text-muted-foreground"
						title={format(item.sentAt, "PPpp")}
					>
						Sent {formatDistanceToNow(item.sentAt, { addSuffix: true })}
					</p>
				</div>
			))}
			{data.pending.map((item) => (
				<div
					className="relative"
					key={`pending-${item.templateName}-${item.scheduledFor.getTime()}`}
				>
					<span
						className={`absolute top-1 -left-[17px] h-2 w-2 rounded-full border-2 bg-background ${item.condition ? "border-muted-foreground" : "border-primary"}`}
					/>
					<p
						className={`font-medium text-[10px] leading-tight ${item.condition ? "text-muted-foreground" : ""}`}
					>
						{item.templateName}
						{item.condition && (
							<span className="ml-1 font-normal">({item.condition})</span>
						)}
					</p>
					<p className="text-[10px] text-muted-foreground">
						{format(item.scheduledFor, "MMM d 'at' p")}
					</p>
				</div>
			))}
		</div>
	);
}

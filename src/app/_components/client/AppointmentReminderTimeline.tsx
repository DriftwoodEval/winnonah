"use client";

import { Skeleton } from "@ui/skeleton";
import { format, formatDistanceToNow } from "date-fns";
import { api } from "~/trpc/react";

function formatPreview(template: string, appointmentTime: Date): string {
	return template
		.replace(/{startTime}/g, format(appointmentTime, "h:mm a"))
		.replace(/{date}/g, format(appointmentTime, "EEEE, MMMM d"));
}

function MessageSnippet({
	messageTemplate,
	appointmentTime,
}: {
	messageTemplate: string;
	appointmentTime: Date;
}) {
	const preview = formatPreview(messageTemplate, appointmentTime);
	return (
		<p className="mt-0.5 line-clamp-3 whitespace-pre-wrap font-mono text-[9px] text-muted-foreground/70 leading-tight">
			{preview}
		</p>
	);
}

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

	const appointmentTime = data.appointmentTime;

	return (
		<div className="relative ml-1 space-y-2 border-border border-l pl-3">
			{data.sent.map((item) => (
				<div
					className="relative"
					key={`sent-${item.templateId}-${item.sentAt.getTime()}`}
				>
					<span className="absolute top-1 -left-[17px] h-2 w-2 rounded-full bg-primary" />
					<p
						className="font-medium text-[10px] leading-tight"
						title={format(item.sentAt, "PPpp")}
					>
						Sent {formatDistanceToNow(item.sentAt, { addSuffix: true })}
					</p>
					<p className="text-[10px] text-muted-foreground leading-tight">
						{item.templateName}
					</p>
					<MessageSnippet
						appointmentTime={appointmentTime}
						messageTemplate={item.messageTemplate}
					/>
				</div>
			))}
			{data.pending.map((item) => (
				<div
					className="relative"
					key={`pending-${item.templateName}-${item.scheduledFor.getTime()}`}
				>
					<span
						className={`absolute top-1 -left-[17px] h-2 w-2 rounded-full border-2 bg-background ${item.isOverdue ? "border-destructive" : item.condition ? "border-muted-foreground" : "border-primary"}`}
					/>
					<p className="font-medium text-[10px] leading-tight">
						{item.isOverdue ? (
							<span className="text-destructive italic">
								sending on next cycle
							</span>
						) : (
							<>
								{format(item.scheduledFor, "MMM d 'at' p")}
								{item.quietAdjusted && (
									<span className="ml-1 font-normal italic">
										(adj. for quiet hours)
									</span>
								)}
							</>
						)}
					</p>
					<p className={`text-[10px] text-muted-foreground leading-tight`}>
						{item.templateName}
						{item.condition && <span className="ml-1">({item.condition})</span>}
					</p>
					<MessageSnippet
						appointmentTime={appointmentTime}
						messageTemplate={item.messageTemplate}
					/>
				</div>
			))}
		</div>
	);
}

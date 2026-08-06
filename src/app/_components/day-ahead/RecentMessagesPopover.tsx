"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { format } from "date-fns";
import { Bot, MessageSquare } from "lucide-react";
import { useMemo } from "react";
import type { TimelineEvent } from "~/lib/quo";
import { cn, getLocalDayFromUTCDate } from "~/lib/utils";
import { api } from "~/trpc/react";
import { Redact } from "../redaction/Redact";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type Proximity = "same-day" | "day-before" | "other";

type RecentMessage = TimelineEvent & { isAutomated: boolean; reason?: string };

function getProximity(
	messageCreatedAt: string,
	appointmentStart: Date,
): Proximity {
	const apptDay = getLocalDayFromUTCDate(appointmentStart);
	if (!apptDay) return "other";

	const msg = new Date(messageCreatedAt);
	const msgDay = new Date(msg.getFullYear(), msg.getMonth(), msg.getDate());

	const diffDays = Math.round(
		(apptDay.getTime() - msgDay.getTime()) / MS_PER_DAY,
	);
	if (diffDays === 0) return "same-day";
	if (diffDays === 1) return "day-before";
	return "other";
}

export function RecentMessagesPopover({
	phoneNumber,
	messages,
	isLoading,
	appointmentStart,
	className,
	onOpenChange,
}: {
	phoneNumber: string | null | undefined;
	messages: RecentMessage[] | undefined;
	isLoading: boolean;
	appointmentStart: Date;
	className?: string;
	onOpenChange?: (open: boolean) => void;
}) {
	const { data: quoUsers } = api.quo.getQuoUsers.useQuery();

	const senderFirstNameById = useMemo(
		() => new Map(quoUsers?.map((u) => [u.id, u.name.split(" ")[0]]) ?? []),
		[quoUsers],
	);

	if (!phoneNumber) return null;

	// Automated sends (reminders, questionnaires, referral messages) don't
	// count as a real reply, so they're excluded from the recency highlight.
	const latestRegular = [...(messages ?? [])]
		.reverse()
		.find((m) => !m.isAutomated);
	const proximity = latestRegular
		? getProximity(latestRegular.createdAt, appointmentStart)
		: "other";
	const isRecent = proximity === "same-day" || proximity === "day-before";

	return (
		<Popover onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>
				<button
					aria-label="Recent messages"
					className={cn(
						"shrink-0 rounded-full p-1 transition-colors",
						isRecent
							? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
							: "text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground",
						className,
					)}
					onClick={(e) => e.stopPropagation()}
					type="button"
				>
					<MessageSquare className="h-3.5 w-3.5" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-80"
				onClick={(e) => e.stopPropagation()}
			>
				{isLoading ? (
					<p className="text-muted-foreground text-xs">Loading messages...</p>
				) : !messages || messages.length === 0 ? (
					<p className="text-muted-foreground text-xs">No message history.</p>
				) : (
					<div className="flex flex-col gap-1.5">
						{messages.map((message) =>
							message.isAutomated ? (
								<div
									className="flex flex-col items-end rounded-md bg-secondary px-2 py-1 text-secondary-foreground"
									key={message.id}
								>
									<div className="flex w-full items-center gap-1.5">
										<Tooltip>
											<TooltipTrigger asChild>
												<Bot className="h-3 w-3 shrink-0 opacity-70" />
											</TooltipTrigger>
											<TooltipContent className="max-w-64 text-left" side="top">
												<Redact>{message.text ?? "No message text."}</Redact>
											</TooltipContent>
										</Tooltip>
										<span className="truncate text-[10px]">
											{message.reason ?? "Automated message"}
										</span>
										<span className="ml-auto shrink-0 text-[10px] text-secondary-foreground/50">
											{format(new Date(message.createdAt), "M/d, h:mm a")}
										</span>
									</div>
								</div>
							) : (
								<div
									className={cn(
										"flex flex-col rounded-md px-2 py-1",
										message.direction === "incoming"
											? "items-start bg-muted text-foreground"
											: "items-end bg-secondary text-secondary-foreground",
									)}
									key={message.id}
								>
									<div className="flex w-full items-center justify-between gap-2">
										<span
											className={cn(
												"font-medium text-[10px] uppercase tracking-wide",
												message.direction === "incoming"
													? "text-foreground/50"
													: "text-secondary-foreground/50",
											)}
										>
											{message.direction === "incoming"
												? "From client"
												: "To client"}
										</span>
										<span
											className={cn(
												"text-[10px]",
												message.direction === "incoming"
													? "text-foreground/50"
													: "text-secondary-foreground/50",
											)}
										>
											{message.direction === "outgoing" &&
												message.userId &&
												senderFirstNameById.get(message.userId) &&
												`${senderFirstNameById.get(message.userId)} · `}
											{format(new Date(message.createdAt), "M/d, h:mm a")}
										</span>
									</div>
									<p className="whitespace-pre-wrap text-xs">
										<Redact>{message.text ?? ""}</Redact>
									</p>
								</div>
							),
						)}
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}

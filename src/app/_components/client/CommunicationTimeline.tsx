"use client";

import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@ui/card";
import { ScrollArea } from "@ui/scroll-area";
import { Skeleton } from "@ui/skeleton";
import { format } from "date-fns";
import { Clock, PhoneIncoming, PhoneOutgoing } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { TimelineEvent } from "~/lib/quo";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";
import { Button } from "../ui/button";

export function CommunicationTimeline({
	phoneNumber,
}: {
	phoneNumber: string;
}) {
	const bottomRef = useRef<HTMLDivElement>(null);
	const {
		data: timeline,
		isLoading,
		error,
	} = api.quo.getContactTimeline.useQuery(
		{ phoneNumber },
		{
			enabled: !!phoneNumber,
		},
	);

	useEffect(() => {
		if (timeline && timeline.length > 0 && bottomRef.current) {
			const viewport = bottomRef.current.closest(
				'[data-slot="scroll-area-viewport"]',
			);
			if (viewport) {
				viewport.scrollTop = viewport.scrollHeight;
			}
		}
	}, [timeline]);

	if (!phoneNumber) return null;

	return (
		<Card className="w-full gap-1 rounded-md p-1">
			<CardHeader className="px-3 py-2">
				<CardTitle className="font-semibold text-sm">Communication</CardTitle>
				<CardDescription className="text-[10px] leading-tight">
					Recent messages and calls. View only.
				</CardDescription>
				<CardAction>
					<Button asChild className="h-auto p-0 text-xs" variant="link">
						<Link href="https://my.quo.com">Quo</Link>
					</Button>
				</CardAction>
			</CardHeader>
			<CardContent className="px-2 pb-2">
				{isLoading ? (
					<div className="space-y-2">
						{[1, 2, 3].map((i) => (
							<Skeleton className="h-12 w-full rounded-md" key={i} />
						))}
					</div>
				) : error ? (
					<div className="p-2 text-destructive text-xs">{error.message}</div>
				) : !timeline || timeline.length === 0 ? (
					<div className="p-4 text-center text-muted-foreground text-xs">
						No history found.
					</div>
				) : (
					<ScrollArea className="h-[400px] lg:h-[500px]">
						<div className="flex flex-col gap-2">
							{timeline.map((event: TimelineEvent, _index: number) => (
								<div className="flex flex-col gap-1" key={event.id}>
									{event.type === "message" ? (
										<div
											className={cn(
												"flex flex-col",
												event.direction === "incoming"
													? "items-start"
													: "items-end",
											)}
										>
											<div
												className={cn(
													"relative max-w-[95%] rounded-lg px-2 pt-1 pb-2",
													event.direction === "incoming"
														? "rounded-tl-none bg-muted text-foreground"
														: "rounded-tr-none bg-accent text-accent-foreground",
												)}
											>
												<p className="mb-1 whitespace-pre-wrap text-[11px] leading-tight">
													{event.text}
												</p>
												<div className="flex items-center justify-end">
													<span
														className={cn(
															"text-[10px]",
															event.direction === "incoming"
																? "text-foreground/50"
																: "text-accent-foreground/50",
														)}
													>
														{format(
															new Date(event.createdAt),
															new Date(event.createdAt).getFullYear() ===
																new Date().getFullYear()
																? "M/d, h:mm a"
																: "M/d/yy, h:mm a",
														)}
													</span>
												</div>
											</div>
										</div>
									) : (
										<div className="flex items-center justify-between gap-2 rounded-md bg-muted/30 p-1.5 text-[10px]">
											<div className="flex min-w-0 flex-1 items-center gap-1.5">
												<div
													className={cn(
														"shrink-0 rounded-full p-1",
														event.direction === "incoming"
															? "bg-primary/10 text-primary"
															: "bg-accent/10 text-accent",
													)}
												>
													{event.direction === "incoming" ? (
														<PhoneIncoming className="h-3 w-3" />
													) : (
														<PhoneOutgoing className="h-3 w-3" />
													)}
												</div>
												<span className="truncate font-medium capitalize leading-tight">
													{event.direction} Call
												</span>
											</div>
											<div className="flex shrink-0 flex-col items-end gap-0.5">
												<div className="flex w-full items-center justify-end gap-1 border-border/20 border-t pt-0.5 text-muted-foreground">
													<div className="flex items-center gap-0.5">
														<Clock className="h-2 w-2" />
														<span className="text-[9px] leading-none">
															{event.duration
																? `${Math.floor(event.duration / 60)}m ${event.duration % 60}s`
																: "Unknown"}
														</span>
													</div>
													{event.status !== "completed" && (
														<span className="font-medium text-[9px] capitalize leading-none">
															• {event.status}
														</span>
													)}
												</div>
												<span className="text-[9px] text-muted-foreground leading-none">
													{format(
														new Date(event.createdAt),
														new Date(event.createdAt).getFullYear() ===
															new Date().getFullYear()
															? "M/d, h:mm a"
															: "M/d/yy, h:mm a",
													)}
												</span>
											</div>
										</div>
									)}
								</div>
							))}
							<div ref={bottomRef} />
						</div>
					</ScrollArea>
				)}
			</CardContent>
		</Card>
	);
}

"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@ui/dropdown-menu";
import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { format } from "date-fns";
import {
	Bell,
	CalendarIcon,
	ChevronDown,
	ChevronRight,
	Clock,
	MapPin,
	MoreHorizontal,
	User,
} from "lucide-react";
import { useState } from "react";
import { getLocalTimeFromUTCDate } from "~/lib/utils";
import { api } from "~/trpc/react";
import { AppointmentReminderTimeline } from "./AppointmentReminderTimeline";

export function ClientAppointments({ clientId }: { clientId: number }) {
	const utils = api.useUtils();
	const [expandedApptId, setExpandedApptId] = useState<string | null>(null);
	const [billingOpen, setBillingOpen] = useState(false);
	const { data: appointments, isLoading } =
		api.appointments.getByClientId.useQuery({
			clientId,
		});

	const updateStatus = api.appointments.updateStatus.useMutation({
		onSuccess: () =>
			void utils.appointments.getByClientId.invalidate({ clientId }),
	});

	if (isLoading) return <Skeleton className="h-64 w-full rounded-md" />;

	const regular = (appointments ?? []).filter((a) => !a.billingOnly);
	const billing = (appointments ?? []).filter((a) => a.billingOnly);

	if (regular.length === 0 && billing.length === 0) return null;

	type Appt = (typeof regular)[0];

	const renderAppointment = (
		appt: Appt,
		index: number,
		list: Appt[],
		isBilling = false,
	) => {
		const startTime = getLocalTimeFromUTCDate(appt.startTime);
		const endTime = getLocalTimeFromUTCDate(appt.endTime);
		if (!startTime || !endTime) return null;

		const isSuppressed = appt.cancelled || appt.rescheduled;
		const isDimmed = isSuppressed || appt.placeholder;

		return (
			<div key={appt.id}>
				<div
					className={`p-3 transition-colors ${isDimmed ? "opacity-60" : ""} ${isBilling ? "bg-muted/40" : ""}`}
				>
					<div className="mb-1.5 flex items-center justify-between">
						<div className="flex items-center gap-2 font-semibold text-sm">
							<CalendarIcon className="h-3.5 w-3.5" />
							{format(startTime, "MMM d, yyyy")}
							<div className="flex gap-1">
								{appt.confirmedAt && (
									<Badge className="h-4 px-1 text-[9px] uppercase">
										Confirmed
									</Badge>
								)}
								{appt.cancelled && (
									<Badge
										className="h-4 px-1 text-[9px] uppercase"
										variant="destructive"
									>
										Cancelled
									</Badge>
								)}
								{appt.rescheduled && (
									<Badge
										className="h-4 px-1 text-[9px] uppercase"
										variant="outline"
									>
										Rescheduled
									</Badge>
								)}
								{appt.placeholder && (
									<Badge
										className="h-4 px-1 text-[9px] uppercase"
										variant="secondary"
									>
										Placeholder
									</Badge>
								)}
								{!isBilling && appt.reminderCount > 0 && (
									<Badge
										className="h-4 px-1 text-[9px] uppercase"
										variant="secondary"
									>
										<Bell className="mr-0.5 h-2.5 w-2.5" />
										{appt.reminderCount}
									</Badge>
								)}
							</div>
						</div>
						<div className="flex items-center gap-1">
							<div className="flex items-center gap-1 text-muted-foreground text-sm">
								<Clock className="h-3 w-3" />
								{format(startTime, "p")} - {format(endTime, "p")}
							</div>
							{!isBilling && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button className="h-6 w-6" size="icon" variant="ghost">
											<MoreHorizontal className="h-3.5 w-3.5" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										{appt.confirmedAt ? (
											<DropdownMenuItem
												onClick={() =>
													updateStatus.mutate({
														id: appt.id,
														confirmedAt: null,
													})
												}
											>
												Remove Confirmation
											</DropdownMenuItem>
										) : (
											<DropdownMenuItem
												onClick={() =>
													updateStatus.mutate({
														id: appt.id,
														confirmedAt: new Date(),
														cancelled: false,
														rescheduled: false,
													})
												}
											>
												Mark Confirmed
											</DropdownMenuItem>
										)}
										<DropdownMenuSeparator />
										{appt.cancelled ? (
											<DropdownMenuItem
												onClick={() =>
													updateStatus.mutate({
														id: appt.id,
														cancelled: false,
													})
												}
											>
												Unmark Cancelled
											</DropdownMenuItem>
										) : (
											<DropdownMenuItem
												className="text-destructive"
												onClick={() =>
													updateStatus.mutate({
														id: appt.id,
														confirmedAt: null,
														cancelled: true,
														rescheduled: false,
													})
												}
											>
												Mark Cancelled
											</DropdownMenuItem>
										)}
										{appt.rescheduled ? (
											<DropdownMenuItem
												onClick={() =>
													updateStatus.mutate({
														id: appt.id,
														rescheduled: false,
													})
												}
											>
												Unmark Rescheduled
											</DropdownMenuItem>
										) : (
											<DropdownMenuItem
												onClick={() =>
													updateStatus.mutate({
														id: appt.id,
														confirmedAt: null,
														cancelled: false,
														rescheduled: true,
													})
												}
											>
												Mark Rescheduled
											</DropdownMenuItem>
										)}
									</DropdownMenuContent>
								</DropdownMenu>
							)}
						</div>
					</div>

					<div className="space-y-1.5">
						<div className="flex items-center gap-2 text-sm">
							<User className="h-3.5 w-3.5 text-muted-foreground" />
							<span>{appt.evaluatorName}</span>
						</div>

						<div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
							{!isBilling && appt.locationKey && (
								<div className="flex items-center gap-1">
									<MapPin className="h-3 w-3" />
									<span className="max-w-[120px] truncate">
										{appt.locationKey}
									</span>
								</div>
							)}

							{appt.daEval && <span className="uppercase">{appt.daEval}</span>}

							{appt.cpt && <span>CPT: {appt.cpt}</span>}
						</div>

						{isSuppressed && !isBilling && (
							<p className="text-[10px] text-muted-foreground uppercase tracking-wider">
								No further reminders
							</p>
						)}
					</div>

					{!isBilling && (
						<Collapsible
							onOpenChange={(open) => setExpandedApptId(open ? appt.id : null)}
							open={expandedApptId === appt.id}
						>
							<CollapsibleTrigger className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground">
								{expandedApptId === appt.id ? (
									<ChevronDown className="h-3 w-3" />
								) : (
									<ChevronRight className="h-3 w-3" />
								)}
								Reminders
							</CollapsibleTrigger>
							<CollapsibleContent className="mt-2">
								<AppointmentReminderTimeline appointmentId={appt.id} />
							</CollapsibleContent>
						</Collapsible>
					)}
				</div>
				{index !== list.length - 1 && <Separator />}
			</div>
		);
	};

	return (
		<div className="flex max-h-80 w-full flex-col overflow-hidden rounded-md border bg-background shadow-sm">
			<div className="sticky top-0 z-10 flex items-center justify-between px-4 pt-4">
				<h4 className="font-bold">Appointments</h4>
				<Badge className="h-5 px-1.5 font-mono text-[10px]" variant="outline">
					{regular.length}
				</Badge>
			</div>

			<ScrollArea className="flex-1">
				<div className="flex flex-col">
					{regular.map((appt, index) =>
						renderAppointment(appt, index, regular),
					)}

					{billing.length > 0 && (
						<>
							{regular.length > 0 && <Separator />}
							<Collapsible onOpenChange={setBillingOpen} open={billingOpen}>
								<CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-muted-foreground text-xs transition-colors hover:text-foreground">
									{billingOpen ? (
										<ChevronDown className="h-3 w-3 shrink-0" />
									) : (
										<ChevronRight className="h-3 w-3 shrink-0" />
									)}
									<span className="font-medium uppercase tracking-wider">
										Billing Only
									</span>
									<Badge
										className="h-4 px-1 font-mono text-[9px]"
										variant="secondary"
									>
										{billing.length}
									</Badge>
								</CollapsibleTrigger>
								<CollapsibleContent>
									<div className="ml-3 border-muted border-l-2">
										{billing.map((appt, index) =>
											renderAppointment(appt, index, billing, true),
										)}
									</div>
								</CollapsibleContent>
							</Collapsible>
						</>
					)}
				</div>
			</ScrollArea>
		</div>
	);
}

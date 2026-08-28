"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { format } from "date-fns";
import { DoorOpen, LogIn, LogOut, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	businessZonedTimeToUtcInstant,
	formatInBusinessTime,
	toBusinessZonedTime,
} from "~/lib/utils";
import { api } from "~/trpc/react";
import {
	ResponsiveDialog,
	useResponsiveDialog,
} from "../shared/ResponsiveDialog";

type Kind = "arrived" | "started" | "left";

export interface CheckinData {
	arrivedAt: Date | null;
	arrivedBy: string | null;
	startedAt: Date | null;
	startedBy: string | null;
	leftAt: Date | null;
	leftBy: string | null;
}

interface CheckInOutControlProps extends CheckinData {
	appointmentId: string;
	startTime: Date;
	endTime: Date;
	isToday: boolean;
	compact?: boolean;
}

const KIND_CONFIG: Record<
	Kind,
	{
		label: string;
		icon: typeof DoorOpen;
		scheduledField: "startTime" | "endTime";
	}
> = {
	arrived: { label: "Arrived", icon: DoorOpen, scheduledField: "startTime" },
	started: { label: "Started", icon: LogIn, scheduledField: "startTime" },
	left: { label: "Left", icon: LogOut, scheduledField: "endTime" },
};

function formatClock(date: Date) {
	return formatInBusinessTime(date, "h:mm a");
}

export function CheckInOutControl({
	appointmentId,
	startTime,
	endTime,
	isToday,
	compact,
	arrivedAt,
	startedAt,
	leftAt,
}: CheckInOutControlProps) {
	const utils = api.useUtils();
	const dialog = useResponsiveDialog();
	const [dialogKind, setDialogKind] = useState<Kind>("arrived");
	// The calendar day is fixed when the dialog opens; only the time of day
	// can be edited, so this never changes while the dialog is open.
	const [entryDate, setEntryDate] = useState<Date>(new Date());
	const [timeValue, setTimeValue] = useState("00:00");

	const invalidate = () => {
		void utils.appointments.getDayAhead.invalidate();
		void utils.appointments.getByClientId.invalidate();
		void utils.appointments.getCalendarRange.invalidate();
	};

	const arriveMutation = api.appointments.arrive.useMutation({
		onSuccess: () => {
			invalidate();
			dialog.closeDialog();
		},
		onError: (error) =>
			toast.error("Couldn't log arrival", { description: error.message }),
	});
	const startMutation = api.appointments.start.useMutation({
		onSuccess: () => {
			invalidate();
			dialog.closeDialog();
		},
		onError: (error) =>
			toast.error("Couldn't log start", { description: error.message }),
	});
	const departMutation = api.appointments.depart.useMutation({
		onSuccess: () => {
			invalidate();
			dialog.closeDialog();
		},
		onError: (error) =>
			toast.error("Couldn't log departure", { description: error.message }),
	});
	const undoMutation = api.appointments.undoLastCheckinStep.useMutation({
		onSuccess: () => {
			invalidate();
			dialog.closeDialog();
		},
		onError: (error) =>
			toast.error("Couldn't undo", { description: error.message }),
	});

	const mutationFor = (kind: Kind) =>
		kind === "arrived"
			? arriveMutation
			: kind === "started"
				? startMutation
				: departMutation;

	const scheduledInstant = (kind: Kind) =>
		KIND_CONFIG[kind].scheduledField === "startTime" ? startTime : endTime;

	const openDialog = (kind: Kind, defaultAt: Date) => {
		setDialogKind(kind);
		setEntryDate(defaultAt);
		setTimeValue(format(defaultAt, "HH:mm"));
		dialog.openDialog();
	};

	const handleClick = (kind: Kind, at: Date | null) => {
		if (at) {
			openDialog(kind, toBusinessZonedTime(at) ?? new Date());
			return;
		}
		const defaultBase = isToday
			? (toBusinessZonedTime(new Date()) ?? new Date())
			: (toBusinessZonedTime(scheduledInstant(kind)) ?? new Date());
		openDialog(kind, defaultBase);
	};

	const submitDialog = () => {
		const [hours, minutes] = timeValue.split(":").map(Number);
		if (hours === undefined || minutes === undefined) return;
		const combined = new Date(entryDate);
		combined.setHours(hours, minutes, 0, 0);
		mutationFor(dialogKind).mutate({
			appointmentId,
			occurredAt: businessZonedTimeToUtcInstant(combined),
		});
	};

	const isPending =
		arriveMutation.isPending ||
		startMutation.isPending ||
		departMutation.isPending ||
		undoMutation.isPending;

	const lastLoggedStage: Kind | null = leftAt
		? "left"
		: startedAt
			? "started"
			: arrivedAt
				? "arrived"
				: null;

	const badgeSize = compact ? "h-5 px-1.5 text-[10px]" : "h-5 px-1.5 text-xs";

	const stages: {
		kind: Kind;
		at: Date | null;
	}[] = [
		{ kind: "arrived", at: arrivedAt },
		{ kind: "started", at: startedAt },
		{ kind: "left", at: leftAt },
	];

	return (
		<>
			<div className="flex shrink-0 flex-wrap items-center gap-1">
				{stages.map(({ kind, at }, i) => {
					const { label, icon: Icon } = KIND_CONFIG[kind];
					const prevDone = i === 0 || stages[i - 1]?.at;
					if (!at) {
						if (!prevDone) return null;
						return (
							<Button
								className={compact ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-xs"}
								key={kind}
								onClick={() => handleClick(kind, at)}
								size="sm"
								variant="outline"
							>
								<Icon className="h-3 w-3" />
								{label}
							</Button>
						);
					}
					return (
						<button
							className={`${badgeSize} inline-flex items-center gap-1 rounded-md border bg-secondary text-secondary-foreground transition-colors hover:opacity-80`}
							key={kind}
							onClick={() => handleClick(kind, at)}
							type="button"
						>
							<Icon className="h-2.5 w-2.5" />
							{formatClock(at)}
						</button>
					);
				})}

				{startedAt && leftAt && !compact && (
					<Badge className="h-5 px-1.5 text-[10px]" variant="outline">
						Actual:{" "}
						{Math.round((leftAt.getTime() - startedAt.getTime()) / 60000)} min
					</Badge>
				)}
			</div>

			<ResponsiveDialog
				description={`${format(entryDate, "MMM d")} — scheduled for ${formatClock(scheduledInstant(dialogKind))}`}
				open={dialog.open}
				setOpen={dialog.setOpen}
				title={KIND_CONFIG[dialogKind].label}
			>
				<div className="flex w-full min-w-72 flex-col gap-4 py-2">
					<div className="flex flex-col gap-1.5">
						<Label>Time</Label>
						<Input
							onChange={(e) => setTimeValue(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									submitDialog();
								}
							}}
							type="time"
							value={timeValue}
						/>
					</div>

					<div className="flex items-center justify-between gap-2">
						{dialogKind === lastLoggedStage ? (
							<Button
								disabled={isPending}
								onClick={() => undoMutation.mutate({ appointmentId })}
								type="button"
								variant="outline"
							>
								<Undo2 className="h-3.5 w-3.5" />
								Back a step
							</Button>
						) : (
							<div />
						)}
						<div className="flex gap-2">
							<Button
								onClick={() => dialog.closeDialog()}
								type="button"
								variant="ghost"
							>
								Cancel
							</Button>
							<Button disabled={isPending} onClick={submitDialog} type="button">
								Save
							</Button>
						</div>
					</div>
				</div>
			</ResponsiveDialog>
		</>
	);
}

"use client";

import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import { format } from "date-fns";
import { DoorOpen, LogOut, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	businessZonedTimeToUtcInstant,
	formatInBusinessTime,
} from "~/lib/utils";
import { api } from "~/trpc/react";
import {
	ResponsiveDialog,
	useResponsiveDialog,
} from "../shared/ResponsiveDialog";

type Kind = "arrived" | "left";

export interface EvaluatorCheckinData {
	arrivedAt: Date | null;
	arrivedBy: string | null;
	leftAt: Date | null;
	leftBy: string | null;
}

interface EvaluatorCheckInOutControlProps extends EvaluatorCheckinData {
	evaluatorNpi: number;
	date: string;
	compact?: boolean;
}

const KIND_CONFIG: Record<Kind, { label: string; icon: typeof DoorOpen }> = {
	arrived: { label: "In for the day", icon: DoorOpen },
	left: { label: "Out for the day", icon: LogOut },
};

function formatClock(date: Date) {
	return formatInBusinessTime(date, "h:mm a");
}

export function EvaluatorCheckInOutControl({
	evaluatorNpi,
	date,
	compact,
	arrivedAt,
	leftAt,
}: EvaluatorCheckInOutControlProps) {
	const utils = api.useUtils();
	const dialog = useResponsiveDialog();
	const [dialogKind, setDialogKind] = useState<Kind>("arrived");
	const [entryDate, setEntryDate] = useState<Date>(new Date());
	const [timeValue, setTimeValue] = useState("00:00");

	const invalidate = () => {
		void utils.appointments.getDayAhead.invalidate();
		void utils.appointments.getEvaluatorCheckins.invalidate();
	};

	const arriveMutation = api.appointments.evaluatorArrive.useMutation({
		onSuccess: () => {
			invalidate();
			dialog.closeDialog();
		},
		onError: (error) =>
			toast.error("Couldn't log arrival", { description: error.message }),
	});
	const departMutation = api.appointments.evaluatorDepart.useMutation({
		onSuccess: () => {
			invalidate();
			dialog.closeDialog();
		},
		onError: (error) =>
			toast.error("Couldn't log departure", { description: error.message }),
	});
	const undoMutation =
		api.appointments.undoLastEvaluatorCheckinStep.useMutation({
			onSuccess: () => {
				invalidate();
				dialog.closeDialog();
			},
			onError: (error) =>
				toast.error("Couldn't undo", { description: error.message }),
		});

	const mutationFor = (kind: Kind) =>
		kind === "arrived" ? arriveMutation : departMutation;

	const isPending =
		arriveMutation.isPending ||
		departMutation.isPending ||
		undoMutation.isPending;

	const openDialog = (kind: Kind, defaultAt: Date) => {
		setDialogKind(kind);
		setEntryDate(defaultAt);
		setTimeValue(format(defaultAt, "HH:mm"));
		dialog.openDialog();
	};

	const handleClick = (kind: Kind, at: Date | null) => {
		openDialog(kind, at ?? new Date());
	};

	const submitDialog = () => {
		const [hours, minutes] = timeValue.split(":").map(Number);
		if (hours === undefined || minutes === undefined) return;
		const combined = new Date(entryDate);
		combined.setHours(hours, minutes, 0, 0);
		mutationFor(dialogKind).mutate({
			evaluatorNpi,
			date,
			occurredAt: businessZonedTimeToUtcInstant(combined),
		});
	};

	const lastLoggedStage: Kind | null = leftAt
		? "left"
		: arrivedAt
			? "arrived"
			: null;

	const badgeSize = compact ? "h-5 px-1.5 text-[10px]" : "h-5 px-1.5 text-xs";

	const stages: { kind: Kind; at: Date | null }[] = [
		{ kind: "arrived", at: arrivedAt },
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
			</div>

			<ResponsiveDialog
				description={format(entryDate, "MMM d")}
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
								onClick={() => undoMutation.mutate({ evaluatorNpi, date })}
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

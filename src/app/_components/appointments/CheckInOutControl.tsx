"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import DateTimePicker from "@ui/date-time-picker";
import { Label } from "@ui/label";
import { RadioGroup, RadioGroupItem } from "@ui/radio-group";
import { Textarea } from "@ui/textarea";
import { LogIn, LogOut, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	APPOINTMENT_CHECKIN_REASON_LABELS,
	APPOINTMENT_CHECKIN_REASONS,
} from "~/lib/constants";
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

const REASON_WINDOW_MINUTES = 15;

type CheckinReason = (typeof APPOINTMENT_CHECKIN_REASONS)[number];
type Kind = "checkin" | "checkout";

export interface CheckinData {
	checkedInAt: Date | null;
	checkedInBy: string | null;
	checkInReason: string | null;
	checkInReasonNote: string | null;
	checkedOutAt: Date | null;
	checkedOutBy: string | null;
	checkOutReason: string | null;
	checkOutReasonNote: string | null;
}

interface CheckInOutControlProps extends CheckinData {
	appointmentId: string;
	startTime: Date;
	endTime: Date;
	isToday: boolean;
	compact?: boolean;
}

function formatClock(date: Date) {
	return formatInBusinessTime(date, "h:mm a");
}

export function CheckInOutControl({
	appointmentId,
	startTime,
	endTime,
	isToday,
	compact,
	checkedInAt,
	checkInReason,
	checkInReasonNote,
	checkedOutAt,
	checkOutReason,
	checkOutReasonNote,
}: CheckInOutControlProps) {
	const utils = api.useUtils();
	const dialog = useResponsiveDialog();
	const [dialogKind, setDialogKind] = useState<Kind>("checkin");
	const [occurredAt, setOccurredAt] = useState<Date>(new Date());
	const [reason, setReason] = useState<CheckinReason | undefined>();
	const [reasonNote, setReasonNote] = useState("");

	const invalidate = () => {
		void utils.appointments.getDayAhead.invalidate();
		void utils.appointments.getByClientId.invalidate();
	};

	const checkInMutation = api.appointments.checkIn.useMutation({
		onSuccess: () => {
			invalidate();
			dialog.closeDialog();
		},
		onError: (error) =>
			toast.error("Couldn't check in", { description: error.message }),
	});
	const checkOutMutation = api.appointments.checkOut.useMutation({
		onSuccess: () => {
			invalidate();
			dialog.closeDialog();
		},
		onError: (error) =>
			toast.error("Couldn't check out", { description: error.message }),
	});

	// Business-zoned representation of the scheduled instant, so it can be
	// diffed against `occurredAt` (a business-local wall-clock Date coming
	// from the date/time picker) with plain getTime() subtraction.
	const scheduledZoned = (kind: Kind) =>
		toBusinessZonedTime(kind === "checkin" ? startTime : endTime) ?? new Date();

	const diffMinutes = (kind: Kind, at: Date) =>
		Math.abs(at.getTime() - scheduledZoned(kind).getTime()) / 60000;

	const reasonRequired =
		diffMinutes(dialogKind, occurredAt) > REASON_WINDOW_MINUTES;

	const openDialog = (
		kind: Kind,
		defaultAt: Date,
		existing?: { reason: string | null; reasonNote: string | null },
	) => {
		setDialogKind(kind);
		setOccurredAt(defaultAt);
		setReason((existing?.reason as CheckinReason | undefined) ?? undefined);
		setReasonNote(existing?.reasonNote ?? "");
		dialog.openDialog();
	};

	const handleQuickAction = (kind: Kind) => {
		const nowInstant = new Date();
		const scheduledInstant = kind === "checkin" ? startTime : endTime;
		const diffMin =
			Math.abs(nowInstant.getTime() - scheduledInstant.getTime()) / 60000;
		if (isToday && diffMin <= REASON_WINDOW_MINUTES) {
			const mutation = kind === "checkin" ? checkInMutation : checkOutMutation;
			mutation.mutate({ appointmentId, occurredAt: nowInstant });
			return;
		}
		openDialog(
			kind,
			isToday
				? (toBusinessZonedTime(nowInstant) ?? nowInstant)
				: scheduledZoned(kind),
		);
	};

	const submitDialog = () => {
		if (reasonRequired && !reason) return;
		if (reasonRequired && reason === "OTHER" && !reasonNote.trim()) return;
		const mutation =
			dialogKind === "checkin" ? checkInMutation : checkOutMutation;
		const finalReason = reasonRequired ? reason : undefined;
		mutation.mutate({
			appointmentId,
			occurredAt: businessZonedTimeToUtcInstant(occurredAt),
			reason: finalReason,
			reasonNote: finalReason === "OTHER" ? reasonNote.trim() : undefined,
		});
	};

	const isPending = checkInMutation.isPending || checkOutMutation.isPending;
	const canSubmit = !isPending && !(reasonRequired && !reason);

	const badgeSize = compact ? "h-5 px-1.5 text-[10px]" : "h-5 px-1.5 text-xs";

	return (
		<>
			<div className="flex shrink-0 flex-wrap items-center gap-1">
				{!checkedInAt ? (
					<Button
						className={compact ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-xs"}
						onClick={() => handleQuickAction("checkin")}
						size="sm"
						variant="outline"
					>
						<LogIn className="h-3 w-3" />
						Check In
					</Button>
				) : (
					<button
						className={`${badgeSize} inline-flex items-center gap-1 rounded-md border bg-secondary text-secondary-foreground transition-colors hover:opacity-80`}
						onClick={() =>
							openDialog(
								"checkin",
								toBusinessZonedTime(checkedInAt) ?? new Date(),
								{
									reason: checkInReason,
									reasonNote: checkInReasonNote,
								},
							)
						}
						type="button"
					>
						<LogIn className="h-2.5 w-2.5" />
						{formatClock(checkedInAt)}
						{checkInReason && <Pencil className="h-2.5 w-2.5 opacity-60" />}
					</button>
				)}

				{checkedInAt && !checkedOutAt && (
					<Button
						className={compact ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-xs"}
						onClick={() => handleQuickAction("checkout")}
						size="sm"
						variant="outline"
					>
						<LogOut className="h-3 w-3" />
						Check Out
					</Button>
				)}

				{checkedOutAt && (
					<button
						className={`${badgeSize} inline-flex items-center gap-1 rounded-md border bg-secondary text-secondary-foreground transition-colors hover:opacity-80`}
						onClick={() =>
							openDialog(
								"checkout",
								toBusinessZonedTime(checkedOutAt) ?? new Date(),
								{ reason: checkOutReason, reasonNote: checkOutReasonNote },
							)
						}
						type="button"
					>
						<LogOut className="h-2.5 w-2.5" />
						{formatClock(checkedOutAt)}
						{checkOutReason && <Pencil className="h-2.5 w-2.5 opacity-60" />}
					</button>
				)}

				{checkedInAt && checkedOutAt && !compact && (
					<Badge className="h-5 px-1.5 text-[10px]" variant="outline">
						Actual:{" "}
						{Math.round(
							(checkedOutAt.getTime() - checkedInAt.getTime()) / 60000,
						)}{" "}
						min
					</Badge>
				)}
			</div>

			<ResponsiveDialog
				description={`Scheduled for ${formatClock(dialogKind === "checkin" ? startTime : endTime)}`}
				open={dialog.open}
				setOpen={dialog.setOpen}
				title={dialogKind === "checkin" ? "Check In" : "Check Out"}
			>
				<div className="flex w-full min-w-72 flex-col gap-4 py-2">
					<div className="flex flex-col gap-1.5">
						<Label>Time</Label>
						<DateTimePicker onChange={setOccurredAt} value={occurredAt} />
					</div>

					{reasonRequired && (
						<div className="flex flex-col gap-2">
							<Label>
								{Math.round(diffMinutes(dialogKind, occurredAt))} minutes off
								schedule, why?
							</Label>
							<RadioGroup
								onValueChange={(v) => setReason(v as CheckinReason)}
								value={reason}
							>
								{APPOINTMENT_CHECKIN_REASONS.map((r) => (
									<div className="flex items-center gap-2" key={r}>
										<RadioGroupItem id={`reason-${r}`} value={r} />
										<Label className="font-normal" htmlFor={`reason-${r}`}>
											{APPOINTMENT_CHECKIN_REASON_LABELS[r]}
										</Label>
									</div>
								))}
							</RadioGroup>
							{reason === "OTHER" && (
								<Textarea
									onChange={(e) => setReasonNote(e.target.value)}
									placeholder="What happened?"
									value={reasonNote}
								/>
							)}
						</div>
					)}

					<div className="flex justify-end gap-2">
						<Button
							onClick={() => dialog.closeDialog()}
							type="button"
							variant="ghost"
						>
							Cancel
						</Button>
						<Button disabled={!canSubmit} onClick={submitDialog} type="button">
							Save
						</Button>
					</div>
				</div>
			</ResponsiveDialog>
		</>
	);
}

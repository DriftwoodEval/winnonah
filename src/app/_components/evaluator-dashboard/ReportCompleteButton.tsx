"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@ui/alert-dialog";
import { Button } from "@ui/button";
import { format } from "date-fns";
import { toast } from "sonner";
import { api } from "~/trpc/react";

interface ReportCompleteButtonProps {
	appointmentId: string;
	completedAt: Date | string | null;
	completedByName: string | null;
	isAdmin: boolean;
}

export function ReportCompleteButton({
	appointmentId,
	completedAt,
	completedByName,
	isAdmin,
}: ReportCompleteButtonProps) {
	const utils = api.useUtils();

	const markComplete = api.evaluatorDashboard.markReportComplete.useMutation({
		onSuccess: () => {
			void utils.evaluatorDashboard.getAppointments.invalidate();
			toast.success("Report marked as complete.");
		},
		onError: (err) =>
			toast.error("Failed to mark complete", { description: err.message }),
	});

	const unmarkComplete =
		api.evaluatorDashboard.unmarkReportComplete.useMutation({
			onSuccess: () => {
				void utils.evaluatorDashboard.getAppointments.invalidate();
				toast.success("Report completion undone.");
			},
			onError: (err) =>
				toast.error("Failed to undo", { description: err.message }),
		});

	if (completedAt) {
		const completedDate = new Date(completedAt);
		return (
			<div className="flex flex-col gap-1">
				<span className="whitespace-nowrap text-muted-foreground text-xs">
					{format(completedDate, "MMM d")}
					{completedByName && ` · ${completedByName}`}
				</span>
				{isAdmin && (
					<Button
						className="h-6 px-2 text-xs"
						disabled={unmarkComplete.isPending}
						onClick={() => unmarkComplete.mutate({ appointmentId })}
						size="sm"
						variant="ghost"
					>
						Undo
					</Button>
				)}
			</div>
		);
	}

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button
					className="bg-primary text-primary-foreground hover:bg-primary/90"
					disabled={markComplete.isPending}
					size="sm"
				>
					Mark Complete
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Mark report as complete?</AlertDialogTitle>
					<AlertDialogDescription>
						This will record that the report has been completed and emailed.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction
						onClick={() => markComplete.mutate({ appointmentId })}
					>
						Confirm
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

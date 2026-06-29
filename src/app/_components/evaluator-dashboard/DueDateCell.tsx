"use client";

import { DatePicker } from "@ui/date-picker";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn, getLocalDayFromUTCDate } from "~/lib/utils";
import { api } from "~/trpc/react";

interface DueDateCellProps {
	appointmentId: string;
	effectiveDueDate: Date;
	dueDateOverride: Date | null;
	isAdmin: boolean;
}

export function DueDateCell({
	appointmentId,
	effectiveDueDate,
	dueDateOverride,
	isAdmin,
}: DueDateCellProps) {
	const utils = api.useUtils();
	const localDueDate =
		getLocalDayFromUTCDate(effectiveDueDate) ?? effectiveDueDate;
	const isOverdue = localDueDate <= new Date();

	const setOverride = api.evaluatorDashboard.setDueDateOverride.useMutation({
		onSuccess: () => {
			void utils.evaluatorDashboard.getAppointments.invalidate();
		},
		onError: (err) =>
			toast.error("Failed to update due date", { description: err.message }),
	});

	if (!isAdmin) {
		return (
			<span
				className={cn("text-sm", isOverdue && "font-medium text-destructive")}
			>
				{format(localDueDate, "MMM d, yyyy")}
				{dueDateOverride && (
					<span className="ml-1 text-muted-foreground text-xs">(override)</span>
				)}
			</span>
		);
	}

	return (
		<div className="flex flex-col gap-1">
			<DatePicker
				allowClear={!!dueDateOverride}
				date={localDueDate}
				id={`due-date-${appointmentId}`}
				placeholder="Set due date"
				setDate={(d) => {
					const dateStr = d
						? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
						: null;
					setOverride.mutate({ appointmentId, date: dateStr });
				}}
			/>
			{dueDateOverride && (
				<span className="text-muted-foreground text-xs">overridden</span>
			)}
		</div>
	);
}

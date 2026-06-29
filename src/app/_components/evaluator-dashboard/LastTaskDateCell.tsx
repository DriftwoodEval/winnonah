"use client";

import { DatePicker } from "@ui/date-picker";
import { format } from "date-fns";
import { toast } from "sonner";
import { api } from "~/trpc/react";

interface LastTaskDateCellProps {
	appointmentId: string;
	date: Date | null;
	isAdmin: boolean;
}

export function LastTaskDateCell({
	appointmentId,
	date,
	isAdmin,
}: LastTaskDateCellProps) {
	const utils = api.useUtils();

	const setDate = api.evaluatorDashboard.setLastTaskCompletedDate.useMutation({
		onSuccess: () => {
			void utils.evaluatorDashboard.getAppointments.invalidate();
		},
		onError: (err) =>
			toast.error("Failed to update date", { description: err.message }),
	});

	if (!isAdmin) {
		return (
			<span className="text-muted-foreground text-sm">
				{date ? format(date, "MMM d, yyyy") : "-"}
			</span>
		);
	}

	return (
		<DatePicker
			allowClear
			date={date ?? undefined}
			id={`last-task-${appointmentId}`}
			placeholder="Set date"
			setDate={(d) => setDate.mutate({ appointmentId, date: d ?? null })}
		/>
	);
}

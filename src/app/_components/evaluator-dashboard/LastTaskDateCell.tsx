"use client";

import { DatePicker } from "@ui/date-picker";
import { format } from "date-fns";
import { toast } from "sonner";
import { api } from "~/trpc/react";

interface LastTaskDateCellProps {
	appointmentId: string;
	date: Date | null;
	fallbackDate: Date | null;
	isAdmin: boolean;
}

export function LastTaskDateCell({
	appointmentId,
	date,
	fallbackDate,
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
		const displayDate = date ?? fallbackDate;
		return (
			<span className="text-muted-foreground text-sm">
				{displayDate ? format(displayDate, "MMM d, yyyy") : "-"}
			</span>
		);
	}

	return (
		<DatePicker
			allowClear
			date={date ?? undefined}
			id={`last-task-${appointmentId}`}
			placeholder={
				fallbackDate ? format(fallbackDate, "MMM d, yyyy") : "Set date"
			}
			setDate={(d) => {
				const dateStr = d
					? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
					: null;
				setDate.mutate({ appointmentId, date: dateStr });
			}}
		/>
	);
}

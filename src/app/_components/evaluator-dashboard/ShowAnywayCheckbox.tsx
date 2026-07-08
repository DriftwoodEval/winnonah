"use client";

import { Checkbox } from "@ui/checkbox";
import { toast } from "sonner";
import { api } from "~/trpc/react";

interface ShowAnywayCheckboxProps {
	appointmentId: string;
	showAnyway: boolean;
}

export function ShowAnywayCheckbox({
	appointmentId,
	showAnyway,
}: ShowAnywayCheckboxProps) {
	const utils = api.useUtils();

	const setShowAnyway = api.evaluatorDashboard.setShowAnyway.useMutation({
		onSuccess: () => {
			void utils.evaluatorDashboard.getAppointments.invalidate();
		},
		onError: (err) =>
			toast.error("Failed to update", { description: err.message }),
	});

	return (
		<Checkbox
			aria-label="Show anyway"
			checked={showAnyway}
			disabled={setShowAnyway.isPending}
			onCheckedChange={(checked) =>
				setShowAnyway.mutate({ appointmentId, showAnyway: !!checked })
			}
		/>
	);
}

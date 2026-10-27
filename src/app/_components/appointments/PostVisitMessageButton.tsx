"use client";

import { Button } from "@ui/button";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { api } from "~/trpc/react";

// Send button for an appointment that qualifies for the post-visit TA message.
// Qualification is decided server-side: the appointment is in the shared
// pending list until its message has been sent.
export function PostVisitMessageButton({
	appointmentId,
}: {
	appointmentId: string;
}) {
	const can = useCheckPermission();
	const canSend = can("clients:appointments:postvisitmessage");
	const utils = api.useUtils();
	const { data: pending } = api.appointments.getPostVisitMessageList.useQuery(
		undefined,
		{ enabled: canSend },
	);
	const { mutate: queue, isPending } =
		api.appointments.queuePostVisitMessage.useMutation({
			onSuccess: () => utils.appointments.getPostVisitMessageList.invalidate(),
		});

	const row = pending?.find((r) => r.appointmentId === appointmentId);
	if (!canSend || !row) return null;

	if (row.queuedAt) {
		return <span className="text-xs text-muted-foreground">Queued</span>;
	}
	return (
		<Button
			disabled={isPending}
			onClick={() => queue({ appointmentId })}
			size="sm"
			variant="outline"
		>
			Send message
		</Button>
	);
}

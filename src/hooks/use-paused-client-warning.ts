"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";

/**
 * Returns a function that shows a warning toast when the client is paused.
 * Call it after an action succeeds that would normally feed an automated
 * send (questionnaires, reminders, records requests), since automation skips
 * paused clients.
 */
export function usePausedClientWarning(clientId: number | undefined) {
	const { data: client } = api.clients.getOne.useQuery(
		{ column: "id", value: String(clientId) },
		{ enabled: typeof clientId === "number" },
	);
	const isPaused = client?.pause ?? false;

	return useCallback(
		(action: string) => {
			if (!isPaused) return;
			toast.warning("This client is paused", {
				description: `${action} was saved, but nothing will be sent or requested automatically until the client is unpaused.`,
				duration: 12000,
			});
		},
		[isPaused],
	);
}

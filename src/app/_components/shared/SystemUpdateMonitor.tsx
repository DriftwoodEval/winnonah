"use client";

import { useSession } from "next-auth/react";
import { useRef } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";

export function SystemUpdateMonitor() {
	const { status } = useSession();
	const serverStartTimeRef = useRef<number | null>(null);
	const toastShownRef = useRef(false);

	api.system.onSystemUpdate.useSubscription(undefined, {
		enabled: status === "authenticated",
		onData(event) {
			if (event.type === "restart") {
				if (serverStartTimeRef.current === null) {
					serverStartTimeRef.current = event.serverStartTime;
				} else if (serverStartTimeRef.current !== event.serverStartTime) {
					showRefreshToast("app-update");
				}
			} else if (event.type === "permissionChange") {
				showRefreshToast("permission-change");
			}
		},
	});

	function showRefreshToast(reason: "app-update" | "permission-change") {
		if (toastShownRef.current) return;
		toastShownRef.current = true;

		const message =
			reason === "app-update"
				? "A new version of the app is available."
				: "Your permissions have been updated.";

		toast(message, {
			description: "Please refresh the page to continue.",
			duration: Number.POSITIVE_INFINITY,
			action: {
				label: "Refresh",
				onClick: () => window.location.reload(),
			},
		});
	}

	return null;
}

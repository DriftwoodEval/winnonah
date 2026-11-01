"use client";

import { useEffect, useRef } from "react";
import { signOut, useSession } from "~/lib/auth-client";

export function SessionExpiryMonitor() {
	const { status } = useSession();
	const checkIntervalRef = useRef<NodeJS.Timeout>(null);

	useEffect(() => {
		if (status !== "authenticated") return;

		// Check session validity every 30 seconds
		checkIntervalRef.current = setInterval(async () => {
			// The endpoint returns null once the session has expired
			const response = await fetch("/api/auth/get-session");
			const currentSession = await response.json();

			if (!currentSession?.user) {
				// Session expired, force logout, and remember where to return to
				const returnTo = `${window.location.pathname}${window.location.search}`;
				await signOut({
					callbackUrl: `/login?timeout=true&callbackUrl=${encodeURIComponent(returnTo)}`,
				});
			}
		}, 30000); // Check every 30 seconds

		return () => {
			if (checkIntervalRef.current) {
				clearInterval(checkIntervalRef.current);
			}
		};
	}, [status]);

	return null;
}

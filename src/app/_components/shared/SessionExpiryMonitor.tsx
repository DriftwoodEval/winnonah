"use client";

import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

export function SessionExpiryMonitor() {
	const { status } = useSession();
	const checkIntervalRef = useRef<NodeJS.Timeout>(null);

	useEffect(() => {
		if (status !== "authenticated") return;

		// Check session validity every 30 seconds
		checkIntervalRef.current = setInterval(async () => {
			// Trigger a session check - if expired, useSession will return null
			const response = await fetch("/api/auth/session");
			const currentSession = await response.json();

			if (!currentSession || !currentSession.user) {
				// Session expired, force logout
				await signOut({ callbackUrl: "/login?timeout=true" });
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

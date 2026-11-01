"use client";

import { useEffect } from "react";
import { authClient } from "~/lib/auth-client";

/**
 * Sends the user to the sign-in page when their session runs out while the
 * page is open. A "view as" session lasts one hour and does not renew, so this
 * is how it ends. The session list is also re-checked on an interval (see
 * `auth-client.ts`), which covers sessions revoked on the server.
 */
export function SessionExpiryMonitor() {
	const { data: session } = authClient.useSession();
	const expiresAt = session?.session.expiresAt;

	useEffect(() => {
		if (!expiresAt) return;

		const timer = setTimeout(
			async () => {
				const { data } = await authClient.getSession({
					query: { disableCookieCache: true },
				});
				if (data) return;

				const returnTo = `${window.location.pathname}${window.location.search}`;
				window.location.assign(
					`/login?timeout=true&callbackUrl=${encodeURIComponent(returnTo)}`,
				);
			},
			Math.max(new Date(expiresAt).getTime() - Date.now(), 0) + 1000,
		);
		return () => clearTimeout(timer);
	}, [expiresAt]);

	return null;
}

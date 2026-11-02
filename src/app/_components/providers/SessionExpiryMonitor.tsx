"use client";

import { useEffect } from "react";
import { authClient } from "~/lib/auth-client";

/** How long to wait before checking again after a request that failed. */
const RETRY_AFTER_FAILURE_MS = 30_000;

/**
 * Sends the user to the sign-in page when their session runs out while the
 * page is open. A "view as" session lasts one hour and does not renew, so this
 * is how it ends. The session is also re-checked on an interval (see
 * `auth-client.ts`), which covers sessions revoked on the server.
 *
 * Only an answer that says there is no session ends it. A request that fails
 * (offline, a deploy in progress) is tried again later instead.
 */
export function SessionExpiryMonitor() {
	const { data: session } = authClient.useSession();
	const expiresAt = session?.session.expiresAt;

	useEffect(() => {
		if (!expiresAt) return;

		let timer: ReturnType<typeof setTimeout>;

		async function check() {
			const { data, error } = await authClient.getSession({
				query: { disableCookieCache: true },
			});
			if (data) return;

			// No error means a 200 with no session, and 401 is the same answer.
			if (error && error.status !== 401) {
				timer = setTimeout(check, RETRY_AFTER_FAILURE_MS);
				return;
			}

			const returnTo = `${window.location.pathname}${window.location.search}`;
			window.location.assign(
				`/login?timeout=true&callbackUrl=${encodeURIComponent(returnTo)}`,
			);
		}

		timer = setTimeout(
			check,
			Math.max(new Date(expiresAt).getTime() - Date.now(), 0) + 1000,
		);
		return () => clearTimeout(timer);
	}, [expiresAt]);

	return null;
}

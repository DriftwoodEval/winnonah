import { toNextJsHandler } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";
import { authInstance } from "~/server/auth/config";
import type { Session } from "~/server/auth/types";
import { db } from "~/server/db";
import { accounts } from "~/server/db/schema";

export type { Session } from "~/server/auth/types";

/**
 * The current session, or null when signed out. While impersonating, this is
 * the impersonated user, and the Google tokens are theirs too.
 *
 * Tokens are added here instead of in the `customSession` plugin so they
 * stay on the server: the plugin's output is also served to the browser.
 */
export const auth = cache(async (): Promise<Session | null> => {
	const clientSession = await authInstance.api.getSession({
		headers: await headers(),
	});
	if (!clientSession) return null;

	const googleAccount = await db.query.accounts.findFirst({
		where: eq(accounts.userId, clientSession.user.id),
	});

	return {
		...clientSession,
		user: {
			...clientSession.user,
			accessToken: googleAccount?.access_token ?? undefined,
			refreshToken: googleAccount?.refresh_token ?? undefined,
		},
	};
});

export const handlers = toNextJsHandler(authInstance);

import { cookies } from "next/headers";

/**
 * "View as another user" cookie, gated behind the `settings:impersonate` permission.
 * Read in the NextAuth session callback so that everything downstream (RSC `auth()`
 * calls, tRPC context, `useSession()` on the client) sees the impersonated user
 * instead of whoever actually signed in.
 */
export const IMPERSONATION_COOKIE = "impersonate-user-id";

export async function getImpersonationCookieId(): Promise<string | null> {
	const store = await cookies();
	return store.get(IMPERSONATION_COOKIE)?.value ?? null;
}

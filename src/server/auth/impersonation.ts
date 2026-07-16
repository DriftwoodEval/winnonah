import { cookies } from "next/headers";

/**
 * Dev-only "view as another user" cookie. Read in the NextAuth session callback so that
 * everything downstream (RSC `auth()` calls, tRPC context, `useSession()` on the client)
 * sees the impersonated user instead of whoever actually signed in.
 */
export const IMPERSONATION_COOKIE = "dev-impersonate-user-id";

export async function getImpersonationTargetId(): Promise<string | null> {
	if (process.env.NODE_ENV !== "development") return null;
	const store = await cookies();
	return store.get(IMPERSONATION_COOKIE)?.value ?? null;
}

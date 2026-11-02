import { isAPIError } from "better-auth/api";
import { toNextJsHandler } from "better-auth/next-js";
import { headers } from "next/headers";
import { cache } from "react";
import { authInstance } from "~/server/auth/config";

/**
 * The current session, or null when signed out. While impersonating, this is
 * the impersonated user.
 */
export const auth = cache(async () => {
	try {
		return await authInstance.api.getSession({ headers: await headers() });
	} catch (error) {
		// An impersonation session whose owner lost the permission is ended
		// while the session is built; treat it as signed out.
		if (isAPIError(error) && error.statusCode === 401) return null;
		throw error;
	}
});

export const handlers = toNextJsHandler(authInstance);

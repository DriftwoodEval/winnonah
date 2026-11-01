import { toNextJsHandler } from "better-auth/next-js";
import { headers } from "next/headers";
import { cache } from "react";
import { authInstance } from "~/server/auth/config";

/**
 * The current session, or null when signed out. While impersonating, this is
 * the impersonated user.
 */
export const auth = cache(async () =>
	authInstance.api.getSession({ headers: await headers() }),
);

export const handlers = toNextJsHandler(authInstance);

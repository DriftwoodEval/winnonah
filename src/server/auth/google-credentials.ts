import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import { env } from "~/env";
import { logger } from "~/lib/logger";
import { authInstance } from "~/server/auth/config";
import {
	readCachedGoogleToken,
	writeCachedGoogleToken,
} from "~/server/auth/google-token-cache";
import { db } from "~/server/db";
import { accounts } from "~/server/db/schema";

async function findGoogleAccount(userId: string) {
	return db.query.accounts.findFirst({
		where: and(eq(accounts.userId, userId), eq(accounts.providerId, "google")),
	});
}

/** Whether the user has linked Google and granted offline access. */
export async function hasGoogleCredentials(userId: string): Promise<boolean> {
	const account = await findGoogleAccount(userId);
	return !!account?.accessToken && !!account.refreshToken;
}

/**
 * Returns a valid Google access token for the user. Better Auth refreshes an
 * expired token with the stored refresh token and saves the new one.
 *
 * Unless `forceRefresh` is set, a cached token is used. `forceRefresh` is for a
 * token that expired mid-use or that Google rejected, so it skips the cache
 * and always asks Google for a new one.
 */
async function getFreshAccessToken(userId: string, forceRefresh: boolean) {
	if (!forceRefresh) {
		const cached = await readCachedGoogleToken(userId);
		if (cached) return cached;
	}

	const account = await findGoogleAccount(userId);
	if (!account?.refreshToken) {
		throw reauthorizationRequired();
	}

	try {
		const body = { accountId: account.id, userId };
		let tokens = forceRefresh
			? await authInstance.api.refreshToken({ body })
			: await authInstance.api.getAccessToken({ body });
		// getAccessToken only refreshes a token whose expiry it knows.
		if (!tokens.accessTokenExpiresAt && !forceRefresh) {
			tokens = await authInstance.api.refreshToken({ body });
		}
		if (!tokens.accessToken) throw new Error("No access token returned");

		const token = {
			access_token: tokens.accessToken,
			// Without a known expiry the token counts as expired, so the next call asks again.
			expiry_date: tokens.accessTokenExpiresAt
				? new Date(tokens.accessTokenExpiresAt).getTime()
				: Date.now(),
		};
		await writeCachedGoogleToken(userId, token);
		return token;
	} catch (error) {
		// The refresh token was revoked or Google rejected the refresh.
		logger.error({ err: error, userId }, "Could not get a Google access token");
		throw reauthorizationRequired();
	}
}

function reauthorizationRequired() {
	return new TRPCError({
		code: "UNAUTHORIZED",
		message:
			"Google access has expired or was revoked. Please sign in with Google again.",
	});
}

/**
 * An OAuth client that acts as the given user. It asks Better Auth for the
 * token when it is first used. If the token expires or Google rejects it, the
 * client asks again and retries the request once.
 */
export function createUserOAuth2Client(userId: string): OAuth2Client {
	const client = new OAuth2Client({
		clientId: env.AUTH_GOOGLE_ID,
		clientSecret: env.AUTH_GOOGLE_SECRET,
	});
	client.forceRefreshOnFailure = true;

	let tokenHandedOut = false;
	client.refreshHandler = () => {
		const forceRefresh = tokenHandedOut;
		tokenHandedOut = true;
		return getFreshAccessToken(userId, forceRefresh);
	};
	return client;
}

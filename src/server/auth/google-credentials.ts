import { and, eq } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import { env } from "~/env";
import { authInstance } from "~/server/auth/config";
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
 */
async function getFreshAccessToken(userId: string) {
	const account = await findGoogleAccount(userId);
	if (!account?.refreshToken) {
		throw new Error("Google account is not connected for this user.");
	}

	const { accessToken, accessTokenExpiresAt } =
		await authInstance.api.getAccessToken({
			body: { accountId: account.id, userId },
		});
	return {
		access_token: accessToken,
		// Without a known expiry the token counts as expired, so the next call asks again.
		expiry_date: accessTokenExpiresAt?.getTime() ?? Date.now(),
	};
}

/**
 * An OAuth client that acts as the given user. It asks Better Auth for the
 * token the first time it is used, and again whenever the token expires.
 */
export function createUserOAuth2Client(userId: string): OAuth2Client {
	const client = new OAuth2Client({
		clientId: env.AUTH_GOOGLE_ID,
		clientSecret: env.AUTH_GOOGLE_SECRET,
	});
	client.refreshHandler = () => getFreshAccessToken(userId);
	return client;
}

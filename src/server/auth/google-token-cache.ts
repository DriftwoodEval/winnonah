import { redis } from "~/lib/integrations/redis";

export interface CachedGoogleToken {
	access_token: string;
	expiry_date: number;
}

const KEY_PREFIX = "google-access-token:";
// Refresh a little early so a token never expires mid-request.
const EXPIRY_MARGIN_MS = 60 * 1000;

/**
 * Google access tokens are cached until shortly before they expire, in Redis
 * so every web instance sees a sign-in or re-authorization right away.
 */
export async function readCachedGoogleToken(userId: string) {
	const cached = await redis.get(`${KEY_PREFIX}${userId}`);
	return cached ? (JSON.parse(cached) as CachedGoogleToken) : null;
}

export async function writeCachedGoogleToken(
	userId: string,
	token: CachedGoogleToken,
) {
	const ttlSeconds = Math.floor(
		(token.expiry_date - Date.now() - EXPIRY_MARGIN_MS) / 1000,
	);
	if (ttlSeconds > 0) {
		await redis.set(
			`${KEY_PREFIX}${userId}`,
			JSON.stringify(token),
			"EX",
			ttlSeconds,
		);
	}
}

/** Forgets the cached access token, for example after the user signs in again. */
export async function clearCachedGoogleToken(userId: string) {
	await redis.del(`${KEY_PREFIX}${userId}`);
}

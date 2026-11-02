import { redis } from "~/lib/integrations/redis";
import { logger } from "~/lib/logger";

export interface CachedGoogleToken {
	access_token: string;
	expiry_date: number;
}

const KEY_PREFIX = "google-access-token:";
// Google's client library treats a token with under 5 minutes left as expired
// and asks for another one. Stop caching a minute before that point, so a
// cached token is never handed out only to be replaced at once.
const EXPIRY_MARGIN_MS = 6 * 60 * 1000;

/**
 * Google access tokens are cached until a few minutes before they expire, in Redis
 * so every web instance sees a sign-in or re-authorization right away.
 *
 * The cache only saves work, so every function here keeps going when Redis is
 * unavailable: a read finds nothing, and a write or clear is skipped.
 */
async function ignoringRedisErrors<T>(fallback: T, action: () => Promise<T>) {
	try {
		return await action();
	} catch (error) {
		logger.warn({ err: error }, "Google token cache is unavailable");
		return fallback;
	}
}

export function readCachedGoogleToken(userId: string) {
	return ignoringRedisErrors<CachedGoogleToken | null>(null, async () => {
		const cached = await redis.get(`${KEY_PREFIX}${userId}`);
		return cached ? (JSON.parse(cached) as CachedGoogleToken) : null;
	});
}

export function writeCachedGoogleToken(
	userId: string,
	token: CachedGoogleToken,
) {
	const ttlSeconds = Math.floor(
		(token.expiry_date - Date.now() - EXPIRY_MARGIN_MS) / 1000,
	);
	if (ttlSeconds <= 0) return Promise.resolve();

	return ignoringRedisErrors(undefined, async () => {
		await redis.set(
			`${KEY_PREFIX}${userId}`,
			JSON.stringify(token),
			"EX",
			ttlSeconds,
		);
	});
}

/** Forgets the cached access token, for example after the user signs in again. */
export function clearCachedGoogleToken(userId: string) {
	return ignoringRedisErrors(undefined, async () => {
		await redis.del(`${KEY_PREFIX}${userId}`);
	});
}

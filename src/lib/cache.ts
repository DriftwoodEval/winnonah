import superjson from "superjson";
import { logger } from "~/lib/logger";
import type { Context } from "~/server/api/trpc";

const log = logger.child({ module: "cache" });
const DEFAULT_CACHE_TTL = 3600; // 1 hour in seconds

// A stale entry is kept in Redis this many times longer than `ttl` so a
// background revalidation has a window to run before it's treated as a cold
// miss. Bounds how far behind reality a value can get if nobody happens to
// re-trigger a refresh (or refreshes keep failing).
const STALE_WINDOW_MULTIPLIER = 5;

interface CacheEnvelope<T> {
	data: T;
	cachedAt: number;
}

// Deduplicates concurrent fetches for the same key, whether that's several
// callers racing a cold miss or a stale read triggering a background
// revalidation while one's already in flight, so a cache stampede only
// triggers one upstream call instead of N.
const inFlight = new Map<string, Promise<unknown>>();

function refresh<T>(
	ctx: Pick<Context, "redis">,
	key: string,
	fetcher: () => Promise<T>,
	ttl: number,
): Promise<CacheEnvelope<T>> {
	const existing = inFlight.get(key) as Promise<CacheEnvelope<T>> | undefined;
	if (existing) return existing;

	const fetchPromise = fetcher()
		.then(async (data) => {
			const envelope: CacheEnvelope<T> = { data, cachedAt: Date.now() };
			try {
				await ctx.redis.set(
					key,
					superjson.stringify(envelope),
					"EX",
					ttl * STALE_WINDOW_MULTIPLIER,
				);
			} catch (err) {
				log.error({ cacheKey: key, error: err }, "Failed to set cache");
			}
			return envelope;
		})
		.finally(() => {
			inFlight.delete(key);
		});

	inFlight.set(key, fetchPromise);
	return fetchPromise;
}

export async function fetchWithCache<T>(
	ctx: Pick<Context, "redis">,
	key: string,
	fetcher: () => Promise<T>,
	ttl: number,
	wantTimestamp: true,
): Promise<{ data: T; lastFetched: number }>;

export async function fetchWithCache<T>(
	ctx: Pick<Context, "redis">,
	key: string,
	fetcher: () => Promise<T>,
	ttl?: number,
	wantTimestamp?: false,
): Promise<T>;

/**
 * A reusable function to fetch data with a stale-while-revalidate strategy.
 * It tries to get data from Redis first. A hit younger than `ttl` is
 * returned as-is. A hit older than `ttl` (but still in Redis) is returned
 * immediately too, while a revalidation fetch kicks off in the background so
 * the *next* read is fresh; callers never block on it. Only a true miss (key
 * absent, e.g. first-ever call, or nobody has read it in `ttl *
 * STALE_WINDOW_MULTIPLIER` seconds) blocks on the fetcher.
 *
 * @param ctx The tRPC context (needs `redis`).
 * @param key The cache key to use.
 * @param fetcher An async function that returns the data to be cached on a miss.
 * @param ttl How long a value is considered fresh, in seconds.
 * @returns The data from the cache or the fetcher.
 */
export async function fetchWithCache<T>(
	ctx: Pick<Context, "redis">,
	key: string,
	fetcher: () => Promise<T>,
	ttl: number = DEFAULT_CACHE_TTL,
	wantTimestamp?: boolean,
): Promise<T | { data: T; lastFetched: number }> {
	// Try to get from cache
	try {
		const cachedData = await ctx.redis.get(key);
		if (cachedData) {
			// superjson.parse returns undefined when given data stored by the old
			// JSON.stringify path (missing the { json, meta } envelope). And a
			// value written before the { data, cachedAt } envelope existed parses
			// fine but isn't shaped like one. Treat both as a cache miss so stale
			// entries self-heal on the next read.
			const parsed = superjson.parse<CacheEnvelope<T> | undefined>(cachedData);
			const envelope =
				parsed &&
				typeof parsed === "object" &&
				typeof parsed.cachedAt === "number" &&
				"data" in parsed
					? parsed
					: undefined;
			if (envelope !== undefined) {
				const ageSeconds = (Date.now() - envelope.cachedAt) / 1000;
				if (ageSeconds > ttl) {
					log.debug({ cacheKey: key }, "Cache hit, stale: revalidating");
					void refresh(ctx, key, fetcher, ttl).catch((err) => {
						log.error(
							{ cacheKey: key, error: err },
							"Background cache revalidation failed",
						);
					});
				} else {
					log.debug({ cacheKey: key }, "Cache hit");
				}
				if (wantTimestamp) {
					return { data: envelope.data, lastFetched: envelope.cachedAt };
				}
				return envelope.data;
			}
			log.debug({ cacheKey: key }, "Cache miss: legacy format, refetching");
		}
	} catch (err) {
		log.error({ cacheKey: key, error: err }, "Failed to get from cache");
	}

	// True miss: block on the fetch, deduplicating concurrent callers.
	log.debug({ cacheKey: key }, "Cache miss");
	const envelope = await refresh(ctx, key, fetcher, ttl);

	if (wantTimestamp) {
		return { data: envelope.data, lastFetched: envelope.cachedAt };
	}

	return envelope.data;
}

/**
 * A reusable function to invalidate (delete) one or more cache keys.
 *
 * @param ctx The tRPC context (needs `redis`).
 * @param keys The cache key(s) to delete.
 */
export async function invalidateCache(
	ctx: Context,
	...keys: string[]
): Promise<void> {
	if (keys.length === 0) return;

	try {
		await ctx.redis.del(keys);
		log.debug({ cacheKeys: keys }, "Cache invalidated");
	} catch (err) {
		log.error({ cacheKeys: keys, error: err }, "Failed to invalidate cache");
	}
}

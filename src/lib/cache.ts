import { logger } from "~/lib/logger";
import type { Context } from "~/server/api/trpc";

const log = logger.child({ module: "cache" });
const DEFAULT_CACHE_TTL = 3600; // 1 hour in seconds

export async function fetchWithCache<T>(
  ctx: Context,
  key: string,
  fetcher: () => Promise<T>,
  ttl: number,
  wantTimestamp: true
): Promise<{ data: T; lastFetched: number }>;

export async function fetchWithCache<T>(
  ctx: Context,
  key: string,
  fetcher: () => Promise<T>,
  ttl?: number,
  wantTimestamp?: false
): Promise<T>;

/**
 * A reusable function to fetch data with a cache-aside strategy.
 * It tries to get data from Redis first. If it's a miss, it calls the
 * fetcher function to get fresh data, caches it, and then returns it.
 *
 * @param ctx The tRPC context (needs `redis`).
 * @param key The cache key to use.
 * @param fetcher An async function that returns the data to be cached on a miss.
 * @param ttl The cache Time To Live in seconds.
 * @returns The data from the cache or the fetcher.
 */
export async function fetchWithCache<T>(
  ctx: Context,
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = DEFAULT_CACHE_TTL,
  wantTimestamp?: boolean
): Promise<T | { data: T; lastFetched: number }> {
  // Try to get from cache
  try {
    const cachedData = await ctx.redis.get(key);
    if (cachedData) {
      const data = JSON.parse(cachedData) as T;

      if (wantTimestamp) {
        const remainingSeconds = await ctx.redis.ttl(key);
        const elapsedSeconds = ttl - remainingSeconds;
        const lastFetched = Date.now() - elapsedSeconds * 1000;
        log.debug({ cacheKey: key }, "Cache hit with timestamp");
        return { data, lastFetched };
      }
      log.debug({ cacheKey: key }, "Cache hit");
      return data;
    }
  } catch (err) {
    log.error({ cacheKey: key, error: err }, "Failed to get from cache");
  }

  // On a cache miss, run the fetcher
  log.debug({ cacheKey: key }, "Cache miss");
  const freshData = await fetcher();

  // Set the new data in cache
  try {
    await ctx.redis.set(key, JSON.stringify(freshData), "EX", ttl);
  } catch (err) {
    log.error({ cacheKey: key, error: err }, "Failed to set cache");
  }

  if (wantTimestamp) {
    return { data: freshData, lastFetched: Date.now() };
  }

  return freshData;
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

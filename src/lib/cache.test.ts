import { describe, expect, it, vi } from "vitest";
import type { Context } from "~/server/api/trpc";
import { fetchWithCache } from "./cache";

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTestCtx() {
	const store = new Map<string, string>();
	const redis = {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		set: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
			return "OK";
		}),
		del: vi.fn(async (keys: string | string[]) => {
			for (const k of Array.isArray(keys) ? keys : [keys]) store.delete(k);
			return 1;
		}),
	};
	return { redis: redis as unknown as Context["redis"] };
}

describe("fetchWithCache", () => {
	it("serves cached data without re-calling the fetcher while fresh", async () => {
		const ctx = createTestCtx();
		const fetcher = vi.fn(async () => "v1");

		expect(await fetchWithCache(ctx, "k1", fetcher, 60)).toBe("v1");
		expect(await fetchWithCache(ctx, "k1", fetcher, 60)).toBe("v1");

		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it("dedupes concurrent misses into a single upstream fetch", async () => {
		const ctx = createTestCtx();
		const fetcher = vi.fn(async () => {
			await sleep(20);
			return "v1";
		});

		const p1 = fetchWithCache(ctx, "k2", fetcher, 60);
		const p2 = fetchWithCache(ctx, "k2", fetcher, 60);

		expect(await p1).toBe("v1");
		expect(await p2).toBe("v1");
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it("serves stale data immediately and revalidates in the background", async () => {
		const ctx = createTestCtx();
		const values = ["v1", "v2"];
		const fetcher = vi.fn(async () => values.shift() as string);

		expect(await fetchWithCache(ctx, "k3", fetcher, 0.02)).toBe("v1");

		await sleep(30); // let the entry go stale (ttl = 20ms)

		// Stale read: still returns the old value immediately...
		expect(await fetchWithCache(ctx, "k3", fetcher, 0.02)).toBe("v1");
		// ...but a background revalidation was kicked off alongside it.
		expect(fetcher).toHaveBeenCalledTimes(2);

		await sleep(10); // give the background refresh a tick to write its result

		expect(await fetchWithCache(ctx, "k3", fetcher, 0.02)).toBe("v2");
	});

	it("blocks on a true miss (key absent, e.g. after invalidateCache)", async () => {
		const ctx = createTestCtx();
		const values = ["v1", "v2"];
		const fetcher = vi.fn(async () => values.shift() as string);

		expect(await fetchWithCache(ctx, "k4", fetcher, 60)).toBe("v1");
		await ctx.redis.del(["k4"]);

		expect(await fetchWithCache(ctx, "k4", fetcher, 60)).toBe("v2");
		expect(fetcher).toHaveBeenCalledTimes(2);
	});
});

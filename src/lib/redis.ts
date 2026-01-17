import Redis from "ioredis";
import { env } from "~/env";

const globalForRedis = globalThis as unknown as {
	redis: Redis | undefined;
};

export const redis =
	globalForRedis.redis ??
	new Redis({
		host: env.REDIS_HOST,
		lazyConnect: true,
	});

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

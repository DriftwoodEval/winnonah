import Redis from "ioredis";
import { env } from "~/env";

export const redis = new Redis({
  host: env.REDIS_HOST,
  lazyConnect: true,
});

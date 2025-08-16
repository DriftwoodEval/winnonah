import { z } from "zod";
import { logger } from "~/lib/logger";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import type { Office } from "~/server/lib/types";

const log = logger.child({ module: "office" });

export const officeRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const cacheKey = "offices:all";
    try {
      const cachedOffices = await ctx.redis.get(cacheKey);
      if (cachedOffices) {
        log.info({ cacheKey: cacheKey }, "Cache hit");
        return JSON.parse(cachedOffices) as Office[];
      }
    } catch (err) {
      log.error(err);
    }
    log.info({ cacheKey: cacheKey }, "Cache miss");
    const offices = await ctx.db.query.offices.findMany({});
    try {
      await ctx.redis.set(cacheKey, JSON.stringify(offices));
      log.info({ cacheKey: cacheKey }, "Cache set");
    } catch (err) {
      log.error(err);
    }
    return offices as Office[];
  }),

  getOne: protectedProcedure
    .input(
      z.object({
        column: z.enum(["key", "prettyName"]),
        value: z.string().min(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const cacheKey = `office:${input.value}`;
      try {
        const cachedOffice = await ctx.redis.get(cacheKey);
        if (cachedOffice) {
          log.info({ cacheKey: cacheKey }, "Cache hit");
          return JSON.parse(cachedOffice);
        }
      } catch (err) {
        log.error(err);
      }
      log.info({ cacheKey: cacheKey }, "Cache miss");
      const office = await ctx.db.query.offices.findFirst({
        where: (o, { eq }) => eq(o[input.column], input.value),
      });
      if (!office) {
        throw new Error("Office not found");
      }
      try {
        await ctx.redis.set(cacheKey, JSON.stringify(office));
        log.info({ cacheKey: cacheKey }, "Cache set");
      } catch (err) {
        log.error(err);
      }
      return office;
    }),
});

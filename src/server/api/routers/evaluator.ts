import { eq } from "drizzle-orm";
import z from "zod";
import { logger } from "~/lib/logger";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clients } from "~/server/db/schema";
import type { Evaluator } from "~/server/lib/types";

const log = logger.child({ module: "evaluator" });

const CACHE_TTL = 3600;

export const evaluatorRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    // TODO: invalidate this when a new evaluator is added
    const cacheKey = "evaluators:all";

    try {
      const cachedEvaluators = await ctx.redis.get(cacheKey);
      if (cachedEvaluators) {
        log.info({ cacheKey: cacheKey }, "CACHE HIT");
        return JSON.parse(cachedEvaluators) as Evaluator[];
      }
    } catch (err) {
      console.error("Redis error in evaluatorRouter.getAll:", err);
    }

    log.info({ cacheKey: cacheKey }, "CACHE MISS");
    const evaluators = await ctx.db.query.evaluators.findMany({
      orderBy: (evaluators, { asc }) => [asc(evaluators.providerName)],
    });

    try {
      await ctx.redis.set(
        cacheKey,
        JSON.stringify(evaluators),
        "EX",
        CACHE_TTL
      );
    } catch (err) {
      console.error("Redus SET failed:", err);
    }

    return evaluators;
  }),

  getEligibleForClient: protectedProcedure
    .input(z.number())
    .query(async ({ ctx, input }) => {
      const clientWithEvaluators = await ctx.db.query.clients.findFirst({
        where: eq(clients.id, input),
        with: {
          clientsEvaluators: {
            with: {
              evaluator: true,
            },
          },
        },
      });

      if (!clientWithEvaluators) {
        return null;
      }

      const correctedEvaluatorsByClient = clientWithEvaluators.clientsEvaluators
        .map((link) => link.evaluator)
        .sort((a, b) => a.providerName.localeCompare(b.providerName));

      return correctedEvaluatorsByClient;
    }),
});

import { eq } from "drizzle-orm";
import z from "zod";
import { logger } from "~/lib/logger";
import { checkRole } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clients, evaluators } from "~/server/db/schema";
import type { Evaluator } from "~/server/lib/types";

const log = logger.child({ module: "evaluator" });

const CACHE_TTL = 3600;

export const evaluatorInputSchema = z.object({
  npi: z.string().regex(/^\d{10}$/),
  providerName: z.string().min(1),
  email: z.email(),
  SCM: z.boolean().default(false),
  BabyNet: z.boolean().default(false),
  Molina: z.boolean().default(false),
  MolinaMarketplace: z.boolean().default(false),
  ATC: z.boolean().default(false),
  Humana: z.boolean().default(false),
  SH: z.boolean().default(false),
  HB: z.boolean().default(false),
  AETNA: z.boolean().default(false),
  United_Optum: z.boolean().default(false),
  districts: z.string().default(""),
  offices: z.string().default(""),
});

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (checkRole(ctx.session.user.role, "admin") === false) {
    throw new Error(
      "UNAUTHORIZED: You must be an admin to perform this action."
    );
  }
  return next({
    ctx: {
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

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

  create: adminProcedure
    .input(evaluatorInputSchema)
    .mutation(async ({ ctx, input }) => {
      const npiAsInt = parseInt(input.npi, 10);
      const resultHeader = await ctx.db.insert(evaluators).values({
        npi: npiAsInt,
        providerName: input.providerName,
        email: input.email,
        SCM: input.SCM,
        BabyNet: input.BabyNet,
        Molina: input.Molina,
        MolinaMarketplace: input.MolinaMarketplace,
        ATC: input.ATC,
        Humana: input.Humana,
        SH: input.SH,
        HB: input.HB,
        AETNA: input.AETNA,
        United_Optum: input.United_Optum,
        districts: input.districts,
        offices: input.offices,
      });

      try {
        await ctx.redis.del("evaluators:all");
        log.info({ cacheKey: "evaluators:all" }, "Cache invalidated");
      } catch (err) {
        log.error(err);
      }

      return resultHeader;
    }),

  update: adminProcedure
    .input(evaluatorInputSchema)
    .mutation(async ({ ctx, input }) => {
      const npiAsInt = parseInt(input.npi, 10);
      const resultHeader = ctx.db
        .update(evaluators)
        .set({
          providerName: input.providerName,
          email: input.email,
          SCM: input.SCM,
          BabyNet: input.BabyNet,
          Molina: input.Molina,
          MolinaMarketplace: input.MolinaMarketplace,
          ATC: input.ATC,
          Humana: input.Humana,
          SH: input.SH,
          HB: input.HB,
          AETNA: input.AETNA,
          United_Optum: input.United_Optum,
          districts: input.districts,
          offices: input.offices,
        })
        .where(eq(evaluators.npi, npiAsInt));

      try {
        await ctx.redis.del("evaluators:all");
        log.info({ cacheKey: "evaluators:all" }, "Cache invalidated");
      } catch (err) {
        log.error(err);
      }

      return resultHeader;
    }),

  delete: adminProcedure
    .input(z.object({ npi: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const npiAsInt = parseInt(input.npi, 10);
      const resultHeader = ctx.db
        .delete(evaluators)
        .where(eq(evaluators.npi, npiAsInt));

      try {
        await ctx.redis.del("evaluators:all");
        log.info({ cacheKey: "evaluators:all" }, "Cache invalidated");
      } catch (err) {
        log.error(err);
      }

      return resultHeader;
    }),
});

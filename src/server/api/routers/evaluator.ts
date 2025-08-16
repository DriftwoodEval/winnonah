import { eq } from "drizzle-orm";
import z from "zod";
import { logger } from "~/lib/logger";
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { clients, evaluatorOffices, evaluators } from "~/server/db/schema";
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
  Aetna: z.boolean().default(false),
  United_Optum: z.boolean().default(false),
  districts: z.string().default(""),
  offices: z.array(z.string()).default([]),
});

export const evaluatorRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const cacheKey = "evaluators:all";

    try {
      const cachedEvaluators = await ctx.redis.get(cacheKey);
      if (cachedEvaluators) {
        log.info({ cacheKey: cacheKey }, "Cache hit");
        return JSON.parse(cachedEvaluators) as Evaluator[];
      }
    } catch (err) {
      log.error(err);
    }

    log.info({ cacheKey: cacheKey }, "Cache miss");
    const evaluatorsWithOffices = await ctx.db.query.evaluators.findMany({
      orderBy: (evaluators, { asc }) => [asc(evaluators.providerName)],
      with: {
        offices: {
          with: {
            office: true,
          },
        },
      },
    });

    const formattedEvaluators = evaluatorsWithOffices.map((evaluator) => ({
      ...evaluator,
      offices: evaluator.offices.map((link) => link.office),
    }));

    try {
      await ctx.redis.set(
        cacheKey,
        JSON.stringify(formattedEvaluators),
        "EX",
        CACHE_TTL
      );
    } catch (err) {
      log.error(err);
    }

    return formattedEvaluators;
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
      const { offices, ...evaluatorData } = input;

      const result = await ctx.db.transaction(async (tx) => {
        await tx.insert(evaluators).values({
          ...evaluatorData,
          npi: npiAsInt,
        });

        if (offices && offices.length > 0) {
          const officeRelationships = offices.map((officeKey) => ({
            evaluatorNpi: npiAsInt,
            officeKey: officeKey,
          }));
          await tx.insert(evaluatorOffices).values(officeRelationships);
        }
      });

      try {
        await ctx.redis.del("evaluators:all");
        log.info({ cacheKey: "evaluators:all" }, "Cache invalidated");
      } catch (err) {
        log.error(err);
      }

      return result;
    }),

  update: adminProcedure
    .input(evaluatorInputSchema)
    .mutation(async ({ ctx, input }) => {
      const npiAsInt = parseInt(input.npi, 10);
      const { offices, ...evaluatorData } = input;

      const result = await ctx.db.transaction(async (tx) => {
        await tx
          .update(evaluators)
          .set({ ...evaluatorData, npi: npiAsInt })
          .where(eq(evaluators.npi, npiAsInt));

        await tx
          .delete(evaluatorOffices)
          .where(eq(evaluatorOffices.evaluatorNpi, npiAsInt));

        if (offices && offices.length > 0) {
          const officeRelationships = offices.map((officeKey) => ({
            evaluatorNpi: npiAsInt,
            officeKey: officeKey,
          }));
          await tx.insert(evaluatorOffices).values(officeRelationships);
        }
      });

      try {
        await ctx.redis.del("evaluators:all");
        log.info({ cacheKey: "evaluators:all" }, "Cache invalidated");
      } catch (err) {
        log.error(err);
      }

      return result;
    }),

  delete: adminProcedure
    .input(z.object({ npi: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const npiAsInt = parseInt(input.npi, 10);

      const result = await ctx.db.transaction(async (tx) => {
        await tx
          .delete(evaluatorOffices)
          .where(eq(evaluatorOffices.evaluatorNpi, npiAsInt));

        await tx.delete(evaluators).where(eq(evaluators.npi, npiAsInt));
      });

      try {
        await ctx.redis.del("evaluators:all");
        log.info({ cacheKey: "evaluators:all" }, "Cache invalidated");
      } catch (err) {
        log.error(err);
      }

      return result;
    }),
});

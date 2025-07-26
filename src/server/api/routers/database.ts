import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clients, clientsEvaluators, questionnaires } from "~/server/db/schema";
import type { Offices } from "~/server/lib/types";
import { asanaRouter } from "./asana";

export const clientRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const clients = await ctx.db.query.clients.findMany({});

    return clients ?? null;
  }),

  getSorted: protectedProcedure.query(async ({ ctx }) => {
    const BNAgeOutDate = new Date();
    BNAgeOutDate.setFullYear(BNAgeOutDate.getFullYear() - 3); // 3 years old

    const highPriorityBNAge = new Date();
    highPriorityBNAge.setMonth(highPriorityBNAge.getMonth() - 30); // Older than 2 years and 6 months;

    const isHighPriority = and(
      or(
        eq(clients.primaryInsurance, "BabyNet"),
        eq(clients.secondaryInsurance, "BabyNet")
      ),
      lt(clients.dob, highPriorityBNAge),
      gt(clients.dob, BNAgeOutDate)
    );

    const allSortedClients = await ctx.db.query.clients.findMany({
      extras: {
        sortReason:
          sql<string>`CASE WHEN ${isHighPriority} THEN 'BabyNet above 2:6' ELSE 'Added date' END`.as(
            "sortReason"
          ),
      },
      orderBy: [
        sql`CASE WHEN ${isHighPriority} THEN 0 ELSE 1 END`,
        sql`CASE WHEN ${isHighPriority} THEN ${clients.dob} ELSE ${clients.addedDate} END`,
      ],
    });

    return allSortedClients;
  }),

  getByNpi: protectedProcedure
    .input(z.number())
    .query(async ({ ctx, input }) => {
      const BNAgeOutDate = new Date();
      BNAgeOutDate.setFullYear(BNAgeOutDate.getFullYear() - 3);

      const highPriorityBNAge = new Date();
      highPriorityBNAge.setMonth(highPriorityBNAge.getMonth() - 30);

      const isHighPriority = and(
        or(
          eq(clients.primaryInsurance, "BabyNet"),
          eq(clients.secondaryInsurance, "BabyNet")
        ),
        lt(clients.dob, highPriorityBNAge),
        gt(clients.dob, BNAgeOutDate)
      );

      const clientsWithReason = await ctx.db
        .select({
          client: clients,
          sortReason:
            sql<string>`CASE WHEN ${isHighPriority} THEN 'BabyNet above 2:6' ELSE 'Added date' END`.as(
              "sortReason"
            ),
        })
        .from(clients)
        .innerJoin(
          clientsEvaluators,
          eq(clients.id, clientsEvaluators.clientId)
        )
        .where(eq(clientsEvaluators.evaluatorNpi, input))
        .orderBy(
          sql`CASE WHEN ${isHighPriority} THEN 0 ELSE 1 END`,
          sql`CASE WHEN ${isHighPriority} THEN ${clients.dob} ELSE ${clients.addedDate} END`
        );

      if (!clientsWithReason || clientsWithReason.length === 0) {
        return null;
      }

      const results = clientsWithReason.map((row) => ({
        ...row.client,
        sortReason: row.sortReason,
      }));

      return results;
    }),

  getOne: protectedProcedure
    .input(
      z.object({
        column: z.enum(["id", "hash"]),
        value: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const foundClient = await ctx.db.query.clients.findFirst({
        where: eq(clients[input.column], input.value),
      });

      if (!foundClient) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Client with ${input.column} ${input.value} not found`,
        });
      }

      return foundClient;
    }),

  getAsanaErrors: protectedProcedure.query(async ({ ctx }) => {
    const clientsWithoutAsanaId = await ctx.db.query.clients.findMany({
      where: and(
        isNull(clients.asanaId),
        gt(clients.addedDate, new Date("2023-01-01"))
      ),
    });

    return clientsWithoutAsanaId;
  }),

  getArchivedAsanaErrors: protectedProcedure.query(async ({ ctx }) => {
    const clientsArchivedInAsana = await ctx.db.query.clients.findMany({
      where: and(eq(clients.archivedInAsana, true), eq(clients.status, true)),
    });

    return clientsArchivedInAsana;
  }),

  getDistrictErrors: protectedProcedure.query(async ({ ctx }) => {
    const clientsWithoutDistrict = await ctx.db.query.clients.findMany({
      where: eq(clients.schoolDistrict, "Unknown"),
    });

    return clientsWithoutDistrict;
  }),

  getBabyNetErrors: protectedProcedure.query(async ({ ctx }) => {
    const ageOutDate = new Date();
    ageOutDate.setFullYear(ageOutDate.getFullYear() - 3); // 3 years old

    const clientsTooOldForBabyNet = await ctx.db.query.clients.findMany({
      where: and(
        or(
          eq(clients.primaryInsurance, "BabyNet"),
          eq(clients.secondaryInsurance, "BabyNet")
        ),
        lt(clients.dob, ageOutDate)
      ),
    });

    return clientsTooOldForBabyNet;
  }),

  addAsanaId: protectedProcedure
    .input(
      z.object({
        clientId: z.number(),
        asanaId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(clients)
        .set({ asanaId: input.asanaId })
        .where(eq(clients.id, input.clientId));

      const asanaCaller = asanaRouter.createCaller(ctx);
      const updatedAsanaProject = await asanaCaller.addClientId({
        projectId: input.asanaId,
        clientId: input.clientId,
      });

      return updatedAsanaProject;
    }),

  updateClient: protectedProcedure
    .input(
      z.object({
        hash: z.string(),
        firstName: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.db.query.clients.findFirst({
        where: eq(clients.hash, input.hash),
      });

      if (!client) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Client with hash ${input.hash} not found`,
        });
      }

      const fullName = `${input.firstName}${
        client.preferredName ? `(${client.preferredName})` : " "
      }${client.lastName}`;

      await ctx.db
        .update(clients)
        .set({ firstName: input.firstName, fullName })
        .where(eq(clients.hash, input.hash));

      const updatedClient = await ctx.db.query.clients.findFirst({
        where: eq(clients.hash, input.hash),
      });

      if (!updatedClient) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Client with hash ${input.hash} not found`,
        });
      }

      return updatedClient;
    }),

  getSentQuestionnaires: protectedProcedure
    .input(z.number())
    .query(async ({ ctx, input }) => {
      const clientWithQuestionnaires = await ctx.db.query.clients.findFirst({
        where: eq(clients.id, input),
        with: {
          questionnaires: {
            orderBy: desc(questionnaires.sent),
          },
        },
      });

      if (!clientWithQuestionnaires) {
        return null;
      }

      return clientWithQuestionnaires.questionnaires ?? null;
    }),

  addQuestionnaire: protectedProcedure
    .input(
      z.object({
        clientId: z.number(),
        questionnaireType: z
          .string()
          .min(1, { message: "Questionnaire type is required" }),
        link: z.url({ message: "Link must be a valid URL" }),
        sent: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const client = await ctx.db.query.clients.findFirst({
        where: eq(clients.id, input.clientId),
      });

      if (!client) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Client with id ${input.clientId} not found`,
        });
      }

      const sentDate = input.sent ?? new Date();

      const normalizedDate = new Date(
        Date.UTC(
          sentDate.getUTCFullYear(),
          sentDate.getUTCMonth(),
          sentDate.getUTCDate(),
          12, // Hours (12 = noon)
          0, // Minutes
          0, // Seconds
          0 // Milliseconds
        )
      );

      const result = await ctx.db.insert(questionnaires).values({
        clientId: input.clientId,
        questionnaireType: input.questionnaireType,
        link: input.link,
        sent: normalizedDate,
        status: "PENDING",
        reminded: 0,
        lastReminded: null,
      });

      const newId = result[0].insertId;

      const newQuestionnaire = await ctx.db.query.questionnaires.findFirst({
        where: eq(questionnaires.id, newId),
      });

      return newQuestionnaire;
    }),
});

export const evaluatorRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const evaluators = await ctx.db.query.evaluators.findMany({});

    return (
      evaluators.sort((a, b) => a.providerName.localeCompare(b.providerName)) ??
      null
    );
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

      return correctedEvaluatorsByClient ?? null;
    }),
});

const officeAddresses = env.OFFICE_ADDRESSES || "";
const ALL_OFFICES: Offices = officeAddresses
  .split(";")
  .reduce((acc: Offices, address) => {
    const [key, ...values] = address.split(":");
    const [latitude, longitude, prettyName] = (values[0] ?? "").split(",");
    if (
      key !== undefined &&
      latitude !== undefined &&
      longitude !== undefined &&
      prettyName !== undefined
    ) {
      acc[key] = { latitude, longitude, prettyName };
    }
    return acc;
  }, {});

export const officeRouter = createTRPCRouter({
  getAll: protectedProcedure.query(() => {
    return ALL_OFFICES ?? null;
  }),
});

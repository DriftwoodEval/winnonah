import { TRPCError } from "@trpc/server";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clients, clientsEvaluators, evaluators } from "~/server/db/schema";
import type { Offices } from "~/server/lib/types";
import { sortClients } from "~/server/lib/utils";
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
      orderBy: [
        sql`CASE WHEN ${isHighPriority} THEN 0 ELSE 1 END`,
        sql`CASE WHEN ${isHighPriority} THEN ${clients.dob} ELSE ${clients.addedDate} END`,
      ],
    });

    const results = allSortedClients.map((client) => {
      // We need to re-check the condition to assign the reason
      const isClientHighPriority =
        (client.primaryInsurance === "BabyNet" ||
          client.secondaryInsurance === "BabyNet") &&
        client.dob < highPriorityBNAge &&
        client.dob > BNAgeOutDate;

      return {
        ...client,
        sortReason: isClientHighPriority ? "BabyNet above 2:6" : "Added date",
      };
    });

    return results;
  }),

  getByNpi: protectedProcedure
    .input(z.number())
    .query(async ({ ctx, input }) => {
      const clientsByNpi = await ctx.db
        .select({ client: clients })
        .from(clients)
        .innerJoin(
          clientsEvaluators,
          eq(clients.id, clientsEvaluators.clientId)
        )
        .where(eq(clientsEvaluators.evaluatorNpi, input));

      const correctedClientsByNpi = clientsByNpi.map(({ client }) => client);

      return sortClients(correctedClientsByNpi) ?? null;
    }),

  getOne: protectedProcedure
    .input(
      z.object({
        column: z.enum(["id", "hash"]),
        value: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const [foundClient] = await ctx.db
        .select({ client: clients })
        .from(clients)
        .where(eq(clients[input.column], input.value))
        .limit(1);

      if (!foundClient) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Client with ${input.column} ${input.value} not found`,
        });
      }

      return foundClient.client;
    }),

  getAsanaErrors: protectedProcedure.query(async ({ ctx }) => {
    const clientsWithoutAsanaId = await ctx.db
      .select({ client: clients })
      .from(clients)
      .where(isNull(clients.asanaId));

    return clientsWithoutAsanaId.map(({ client }) => client);
  }),

  getArchivedAsanaErrors: protectedProcedure.query(async ({ ctx }) => {
    const clientsArchivedInAsana = await ctx.db
      .select({ client: clients })
      .from(clients)
      .where(eq(clients.archivedInAsana, true));

    return clientsArchivedInAsana.map(({ client }) => client);
  }),

  getDistrictErrors: protectedProcedure.query(async ({ ctx }) => {
    const clientsWithoutDistrict = await ctx.db
      .select({ client: clients })
      .from(clients)
      .where(eq(clients.schoolDistrict, "Unknown"));

    return clientsWithoutDistrict.map(({ client }) => client);
  }),

  getBabyNetErrors: protectedProcedure.query(async ({ ctx }) => {
    const ageOutDate = new Date();
    ageOutDate.setFullYear(ageOutDate.getFullYear() - 3); // 3 years old

    const clientsTooOldForBabyNet = await ctx.db
      .select()
      .from(clients)
      .where(
        and(
          or(
            eq(clients.primaryInsurance, "BabyNet"),
            eq(clients.secondaryInsurance, "BabyNet")
          ),
          lt(clients.dob, ageOutDate)
        )
      );

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
      const [client] = await ctx.db
        .select({ client: clients })
        .from(clients)
        .where(eq(clients.hash, input.hash))
        .limit(1);

      if (!client) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Client with hash ${input.hash} not found`,
        });
      }

      const fullName = `${input.firstName}${
        client.client.preferredName ? `(${client.client.preferredName})` : " "
      }${client.client.lastName}`;

      await ctx.db
        .update(clients)
        .set({ firstName: input.firstName, fullName })
        .where(eq(clients.hash, input.hash));

      const [updatedClient] = await ctx.db
        .select({ client: clients })
        .from(clients)
        .where(eq(clients.hash, input.hash))
        .limit(1);

      if (!updatedClient) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Client with hash ${input.hash} not found`,
        });
      }

      return updatedClient;
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
      const evaluatorsByClient = await ctx.db
        .select({ evaluator: evaluators })
        .from(evaluators)
        .innerJoin(
          clientsEvaluators,
          eq(evaluators.npi, clientsEvaluators.evaluatorNpi)
        )
        .where(eq(clientsEvaluators.clientId, input));

      const correctedEvaluatorsByClient = evaluatorsByClient
        .map(({ evaluator }) => evaluator)
        .sort((a, b) => a.providerName.localeCompare(b.providerName));

      return correctedEvaluatorsByClient ?? null;
    }),
});

const officeAddresses = env.OFFICE_ADDRESSES;
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

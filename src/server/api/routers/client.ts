import { TRPCError } from "@trpc/server";
import { subMonths, subYears } from "date-fns";
import {
  and,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNull,
  like,
  lt,
  not,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { CLIENT_COLOR_KEYS } from "~/lib/colors";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clients, clientsEvaluators } from "~/server/db/schema";

const getBabyNetPriorityInfo = () => {
  const now = new Date();
  const BNAgeOutDate = subYears(now, 3);
  const highPriorityBNAge = subMonths(now, 30); // 2 years and 6 months

  const isHighPriority = and(
    or(
      eq(clients.primaryInsurance, "BabyNet"),
      eq(clients.secondaryInsurance, "BabyNet")
    ),
    lt(clients.dob, highPriorityBNAge),
    gt(clients.dob, BNAgeOutDate)
  );

  const sortReasonSQL =
    sql<string>`CASE WHEN ${isHighPriority} THEN 'BabyNet above 2:6' ELSE 'Added date' END`.as(
      "sortReason"
    );

  const orderBySQL = [
    sql`CASE WHEN ${isHighPriority} THEN 0 ELSE 1 END`, // Priority clients first
    sql`CASE WHEN ${isHighPriority} THEN ${clients.dob} ELSE ${clients.addedDate} END`,
  ];

  return { isHighPriority, sortReasonSQL, orderBySQL };
};

export const clientRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const clients = await ctx.db.query.clients.findMany({});

    return clients;
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

  getSorted: protectedProcedure.query(async ({ ctx }) => {
    const { sortReasonSQL, orderBySQL } = getBabyNetPriorityInfo();

    const allSortedClients = await ctx.db.query.clients.findMany({
      extras: { sortReason: sortReasonSQL },
      orderBy: orderBySQL,
    });

    return allSortedClients;
  }),

  getByNpi: protectedProcedure
    .input(z.number())
    .query(async ({ ctx, input }) => {
      const { sortReasonSQL, orderBySQL } = getBabyNetPriorityInfo();

      const clientsWithReason = await ctx.db
        .select({
          client: clients,
          sortReason: sortReasonSQL,
        })
        .from(clients)
        .innerJoin(
          clientsEvaluators,
          eq(clients.id, clientsEvaluators.clientId)
        )
        .where(eq(clientsEvaluators.evaluatorNpi, input))
        .orderBy(...orderBySQL);

      if (!clientsWithReason || clientsWithReason.length === 0) {
        return null;
      }

      const results = clientsWithReason.map((row) => ({
        ...row.client,
        sortReason: row.sortReason,
      }));

      return results;
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

  getNotInTAErrors: protectedProcedure.query(async ({ ctx }) => {
    const clientsNotInTA = await ctx.db.query.clients.findMany({
      where: isNull(clients.addedDate),
    });

    return clientsNotInTA;
  }),

  updateColor: protectedProcedure
    .input(z.object({ hash: z.string(), color: z.enum(CLIENT_COLOR_KEYS) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(clients)
        .set({ color: input.color })
        .where(eq(clients.hash, input.hash));

      return { success: true };
    }),

  updateClient: protectedProcedure
    .input(
      z.object({
        clientId: z.number(),
        asanaId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: { asanaId?: string } = {};

      if (input.asanaId !== undefined) updateData.asanaId = input.asanaId;

      await ctx.db
        .update(clients)
        .set(updateData)
        .where(eq(clients.id, input.clientId));

      const updatedClient = await ctx.db.query.clients.findFirst({
        where: eq(clients.id, input.clientId),
      });

      if (!updatedClient) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Client with ID ${input.clientId} not found`,
        });
      }

      return updatedClient;
    }),

  search: protectedProcedure
    .input(
      z.object({
        evaluatorNpi: z.number().optional(),
        office: z.string().optional(),
        appointmentType: z.enum(["EVAL", "DA", "DAEVAL"]).optional(),
        appointmentDate: z.date().optional(),
        nameSearch: z.string().optional(),
        hideBabyNet: z.boolean().optional(),
        status: z.enum(["active", "inactive", "all"]).optional(),
        color: z.enum(CLIENT_COLOR_KEYS).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const {
        evaluatorNpi,
        office,
        // Future implementation
        // appointmentType,
        // appointmentDate,
        nameSearch,
        hideBabyNet,
        status,
        color,
      } = input;

      const effectiveStatus = status ?? "active";

      const conditions = [];

      if (nameSearch && nameSearch.length >= 3) {
        conditions.push(like(clients.fullName, `%${nameSearch}%`));
      }
      if (office) {
        conditions.push(eq(clients.closestOffice, office));
      }
      if (effectiveStatus === "active") {
        conditions.push(eq(clients.status, true));
      } else if (effectiveStatus === "inactive") {
        conditions.push(eq(clients.status, false));
      }
      if (hideBabyNet) {
        conditions.push(
          and(
            not(eq(clients.primaryInsurance, "BabyNet")),
            not(eq(clients.secondaryInsurance, "BabyNet"))
          )
        );
      }

      if (evaluatorNpi) {
        const clientIdsQuery = ctx.db
          .select({ id: clientsEvaluators.clientId })
          .from(clientsEvaluators)
          .where(eq(clientsEvaluators.evaluatorNpi, evaluatorNpi));

        conditions.push(inArray(clients.id, clientIdsQuery));
      }

      if (color) {
        conditions.push(eq(clients.color, color));
      }

      const { sortReasonSQL, orderBySQL } = getBabyNetPriorityInfo();

      const filteredAndSortedClients = await ctx.db
        .select({ ...getTableColumns(clients), sortReason: sortReasonSQL })
        .from(clients)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(...orderBySQL);

      return filteredAndSortedClients;
    }),
});

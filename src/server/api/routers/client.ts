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
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { clients, clientsEvaluators } from "~/server/db/schema";

const getPriorityInfo = () => {
  const now = new Date();
  const BNAgeOutDate = subYears(now, 3);
  const highPriorityBNAge = subMonths(now, 30); // 2 years and 6 months

  const isHighPriorityClient = eq(clients.highPriority, true);

  const isHighPriorityBN = and(
    or(
      eq(clients.primaryInsurance, "BabyNet"),
      eq(clients.secondaryInsurance, "BabyNet")
    ),
    lt(clients.dob, highPriorityBNAge),
    gt(clients.dob, BNAgeOutDate)
  );

  const sortReasonSQL = sql<string>`CASE
      WHEN ${isHighPriorityClient} THEN 'High Priority'
      WHEN ${isHighPriorityBN} THEN 'BabyNet above 2:6'
      ELSE 'Added date'
    END`.as("sortReason");

  const orderBySQL = [
    // Primary sorting: 0 for BabyNet, 1 for top priority, 2 for everyone else
    sql`CASE
      WHEN ${isHighPriorityBN} THEN 0
      WHEN ${isHighPriorityClient} THEN 1
      ELSE 2
    END`,
    // Secondary sorting: BabyNet group is sorted by DOB, all others by added date
    sql`CASE
      WHEN ${isHighPriorityBN} THEN ${clients.dob}
      ELSE ${clients.addedDate}
    END`,
  ];

  // A combined flag for any type of priority status
  const isPriority = or(isHighPriorityClient, isHighPriorityBN);

  return { isPriority, sortReasonSQL, orderBySQL };
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
    const { sortReasonSQL, orderBySQL } = getPriorityInfo();

    const allSortedClients = await ctx.db.query.clients.findMany({
      extras: { sortReason: sortReasonSQL },
      orderBy: orderBySQL,
    });

    return allSortedClients;
  }),

  getByNpi: protectedProcedure
    .input(z.number())
    .query(async ({ ctx, input }) => {
      const { sortReasonSQL, orderBySQL } = getPriorityInfo();

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
      where: or(
        eq(clients.schoolDistrict, "Unknown"),
        isNull(clients.schoolDistrict)
      ),
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
        lt(clients.dob, ageOutDate),
        eq(clients.status, true)
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

  update: adminProcedure
    .input(
      z.object({
        clientId: z.number(),
        color: z.enum(CLIENT_COLOR_KEYS).optional(),
        schoolDistrict: z.string().optional(),
        highPriority: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: {
        color?: (typeof CLIENT_COLOR_KEYS)[number];
        schoolDistrict?: string;
        highPriority?: boolean;
      } = {};

      if (input.color !== undefined) {
        updateData.color = input.color;
      }
      if (input.schoolDistrict !== undefined) {
        updateData.schoolDistrict = input.schoolDistrict;
      }
      if (input.highPriority !== undefined) {
        updateData.highPriority = input.highPriority;
      }

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
        privatePay: z.boolean().optional(),
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
        privatePay,
      } = input;

      const effectiveStatus = status ?? "active";

      const conditions = [];

      if (nameSearch) {
        const numericId = parseInt(nameSearch.trim(), 10);
        if (!Number.isNaN(numericId)) {
          conditions.push(like(clients.id, `${numericId}%`));
        } else if (nameSearch.length >= 3) {
          // Clean the user's input string by replacing non-alphanumeric characters with spaces
          const cleanedSearchString = nameSearch.replace(/[^\w ]/g, " ");

          // Split the cleaned string by spaces and filter out any empty strings
          const searchWords = cleanedSearchString.split(" ").filter(Boolean);

          if (searchWords.length > 0) {
            const nameConditions = searchWords.map(
              (word) =>
                sql`REGEXP_REPLACE(${
                  clients.fullName
                  // As bizarre as this looks, we have to escape the slash for both JS and SQL
                }, '[^\\\\w ]', '') like ${`%${word}%`}`
            );

            conditions.push(and(...nameConditions));
          }
        }
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
            or(
              not(eq(clients.secondaryInsurance, "BabyNet")),
              isNull(clients.secondaryInsurance)
            )
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

      if (privatePay) {
        conditions.push(eq(clients.privatePay, true));
      }

      const countByColor = await ctx.db
        .select({
          color: clients.color,
          count: sql<number>`COUNT(*)`.as("count"),
        })
        .from(clients)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .groupBy(clients.color);

      if (color) {
        conditions.push(eq(clients.color, color));
      }

      const { sortReasonSQL, orderBySQL } = getPriorityInfo();

      const filteredAndSortedClients = await ctx.db
        .select({ ...getTableColumns(clients), sortReason: sortReasonSQL })
        .from(clients)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(...orderBySQL);

      return {
        clients: filteredAndSortedClients,
        colorCounts: countByColor,
      };
    }),
});

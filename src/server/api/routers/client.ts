import { createHash } from "node:crypto";
import type { JSONContent } from "@tiptap/core";
import { TRPCError } from "@trpc/server";
import { subMonths, subYears } from "date-fns";
import {
  and,
  count,
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
import { clients, clientsEvaluators, notes } from "~/server/db/schema";

const getPriorityInfo = () => {
  const now = new Date();
  const BNAgeOutDate = subYears(now, 3);
  const highPriorityBNAge = subMonths(now, 30); // 2 years and 6 months

  const isHighPriorityClient = eq(clients.highPriority, true);

  const isHighPriorityBN = and(
    or(
      eq(clients.primaryInsurance, "BabyNet"),
      eq(clients.secondaryInsurance, "BabyNet"),
      eq(clients.babyNet, true)
    ),
    lt(clients.dob, highPriorityBNAge),
    gt(clients.dob, BNAgeOutDate)
  );

  const sortReasonSQL = sql<string>`CASE
      WHEN ${isHighPriorityBN} AND ${isHighPriorityClient} THEN 'BabyNet and High Priority'
      WHEN ${isHighPriorityBN} THEN 'BabyNet above 2:6'
      WHEN ${isHighPriorityClient} THEN 'High Priority'
      WHEN CHAR_LENGTH(${clients.id}) = 5 THEN 'Note only'
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
      where: and(
        or(
          eq(clients.schoolDistrict, "Unknown"),
          isNull(clients.schoolDistrict)
        ),
        gt(clients.dob, subYears(new Date(), 21)),
        not(eq(sql`LENGTH(${clients.id})`, 5))
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
      orderBy: clients.addedDate,
    });

    // Discussed in meeting on 9/11/25: Automatically disable BabyNet bool for clients that age out
    const clientsTooOldForBabyNetBool = await ctx.db.query.clients.findMany({
      where: and(
        eq(clients.babyNet, true),
        lt(clients.dob, ageOutDate),
        eq(clients.status, true)
      ),
    });

    for (const client of clientsTooOldForBabyNetBool) {
      await ctx.db
        .update(clients)
        .set({ babyNet: false })
        .where(eq(clients.id, client.id));
    }

    return clientsTooOldForBabyNet;
  }),

  getNotInTAErrors: protectedProcedure.query(async ({ ctx }) => {
    const clientsNotInTA = await ctx.db.query.clients.findMany({
      where: isNull(clients.addedDate),
      orderBy: clients.addedDate,
    });

    return clientsNotInTA;
  }),

  getNoteOnlyClients: protectedProcedure.query(async ({ ctx }) => {
    const noteOnlyClients = await ctx.db.query.clients.findMany({
      where: eq(sql`LENGTH(${clients.id})`, 5),
      orderBy: clients.addedDate,
    });

    return noteOnlyClients;
  }),

  getDuplicateDriveIdErrors: protectedProcedure.query(async ({ ctx }) => {
    const duplicateDriveIds = await ctx.db
      .select({
        driveId: clients.driveId,
        count: count().as("count"),
      })
      .from(clients)
      .where(sql`${clients.driveId} IS NOT NULL`)
      .groupBy(clients.driveId)
      .having(gt(count(), 1));

    const duplicateIds = duplicateDriveIds.map((row) => row.driveId);

    if (duplicateIds.length === 0) {
      return [];
    }

    const duplicateRecords = await ctx.db
      .select()
      .from(clients)
      .where(sql`${clients.driveId} IN (${duplicateIds})`)
      .orderBy(clients.addedDate);

    return duplicateRecords;
  }),

  getPossiblePrivatePay: protectedProcedure.query(async ({ ctx }) => {
    const noPaymentMethodOrNoEligibleEvaluators = await ctx.db
      .select(getTableColumns(clients))
      .from(clients)
      .leftJoin(clientsEvaluators, eq(clients.id, clientsEvaluators.clientId))
      .where(
        and(
          or(
            and(
              isNull(clients.primaryInsurance),
              isNull(clients.secondaryInsurance),
              eq(clients.privatePay, false)
            ),
            isNull(clientsEvaluators.clientId)
          ),
          eq(clients.status, true),
          not(eq(sql`LENGTH(${clients.id})`, 5))
        )
      )
      .orderBy(clients.addedDate);

    return noPaymentMethodOrNoEligibleEvaluators;
  }),

  createShell: adminProcedure
    .input(z.object({ firstName: z.string(), lastName: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const id = Math.floor(10000 + Math.random() * 90000); // Random 5 digit number
      await ctx.db.insert(clients).values({
        id: id,
        hash: createHash("md5").update(String(id)).digest("hex"),
        dob: new Date(0),
        firstName: input.firstName,
        lastName: input.lastName,
        fullName: `${input.firstName} ${input.lastName}`,
        addedDate: new Date(),
      });

      const newClient = await ctx.db.query.clients.findFirst({
        where: eq(clients.id, id),
      });

      if (!newClient) {
        throw new Error(
          "Failed to create client: could not retrieve new client."
        );
      }

      return newClient.hash;
    }),

  autismStop: protectedProcedure
    .input(
      z.object({
        clientId: z.number(),
        autismStop: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        ctx.session.user.role !== "superadmin" &&
        input.autismStop === false
      ) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
        });
      }

      await ctx.db
        .update(clients)
        .set({
          autismStop: input.autismStop,
        })
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

  update: adminProcedure
    .input(
      z.object({
        clientId: z.number(),
        color: z.enum(CLIENT_COLOR_KEYS).optional(),
        schoolDistrict: z.string().optional(),
        highPriority: z.boolean().optional(),
        babyNet: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: {
        color?: (typeof CLIENT_COLOR_KEYS)[number];
        schoolDistrict?: string;
        highPriority?: boolean;
        babyNet?: boolean;
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
      if (input.babyNet !== undefined) {
        updateData.babyNet = input.babyNet;
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
        type: z.enum(["both", "real", "note"]).optional(),
        color: z.enum(CLIENT_COLOR_KEYS).optional(),
        privatePay: z.boolean().optional(),
        sort: z
          .enum(["priority", "firstName", "lastName", "paExpiration"])
          .optional(),
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
        type,
        color,
        privatePay,
        sort,
      } = input;

      const effectiveStatus = status ?? "active";
      const effectiveType = type ?? "both";

      const effectiveSort = sort ?? "priority";

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

      if (effectiveType === "real") {
        conditions.push(not(eq(sql`LENGTH(${clients.id})`, 5)));
      } else if (effectiveType === "note") {
        conditions.push(eq(sql`LENGTH(${clients.id})`, 5));
      }

      if (hideBabyNet) {
        conditions.push(
          and(
            not(eq(clients.primaryInsurance, "BabyNet")),
            or(
              not(eq(clients.secondaryInsurance, "BabyNet")),
              isNull(clients.secondaryInsurance)
            ),
            not(eq(clients.babyNet, true))
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

      let { sortReasonSQL, orderBySQL } = getPriorityInfo();

      if (effectiveSort === "priority") {
      } else if (effectiveSort === "firstName") {
        orderBySQL = [sql`${clients.firstName}`];
      } else if (effectiveSort === "lastName") {
        orderBySQL = [sql`${clients.lastName}`];
      } else if (effectiveSort === "paExpiration") {
        orderBySQL = [
          sql`CASE
            WHEN ${clients.precertExpires} IS NULL THEN 3
            WHEN ${clients.precertExpires} < NOW() THEN 2
            ELSE 1
        END`,
          sql`${clients.precertExpires}`,
        ];
        sortReasonSQL = sql<string>`CASE
      WHEN ${clients.precertExpires} IS NULL THEN 'No PA'
      WHEN ${clients.precertExpires} < NOW() THEN 'Expired PA'
      ELSE 'Expiration date'
    END`.as("sortReason");
      }

      const filteredAndSortedClients = await ctx.db
        .select({ ...getTableColumns(clients), sortReason: sortReasonSQL })
        .from(clients)
        .where(
          and(
            conditions.length > 0 ? and(...conditions) : undefined
            // eq(sql`CHAR_LENGTH(${clients.id})`, 7)
          )
        )
        .orderBy(...orderBySQL);

      return {
        clients: filteredAndSortedClients,
        colorCounts: countByColor,
      };
    }),

  replaceNotes: protectedProcedure
    .input(
      z.object({
        clientId: z.number(),
        fakeClientId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { clientId, fakeClientId } = input;

      const [realClientNote] = await ctx.db
        .select()
        .from(notes)
        .where(eq(notes.clientId, clientId))
        .limit(1);

      const [fakeClientNote] = await ctx.db
        .select()
        .from(notes)
        .where(eq(notes.clientId, fakeClientId))
        .limit(1);

      if (!fakeClientNote) {
        throw new Error("Fake client note does not exist to merge.");
      }

      const fakeContent = fakeClientNote.content as JSONContent;

      if (!fakeContent?.content || !Array.isArray(fakeContent.content)) {
        throw new Error(
          "Fake client note content is not in the expected Tiptap format."
        );
      }

      let mergedContent: JSONContent;

      if (realClientNote) {
        // Case 1: Real note exists. Merge content and add a separator.
        const realContent = realClientNote.content as JSONContent;

        if (!realContent?.content || !Array.isArray(realContent.content)) {
          throw new Error(
            "Real client note content is not in the expected Tiptap format."
          );
        }

        const separator = {
          type: "paragraph",
        };

        // Combine the content with the separator in between.
        mergedContent = {
          type: "doc",
          content: [...realContent.content, separator, ...fakeContent.content],
        };

        // Update the existing note.
        await ctx.db
          .update(notes)
          .set({
            content: mergedContent,
            updatedAt: new Date(),
            title: fakeClientNote.title,
          })
          .where(eq(notes.clientId, clientId));
      } else {
        // Case 2: Real note does not exist. Create a new one.
        mergedContent = {
          type: "doc",
          content: [...fakeContent.content],
        };

        // Insert a new note entry for the real client.
        await ctx.db.insert(notes).values({
          clientId: clientId,
          content: mergedContent,
          title: fakeClientNote.title,
        });
      }

      await ctx.db
        .update(clients)
        .set({ status: false })
        .where(eq(clients.id, fakeClientId));

      return { success: true };
    }),
});

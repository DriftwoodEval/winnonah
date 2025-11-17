import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { hasPermission } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { externalRecordHistory, externalRecords } from "~/server/db/schema";

export const externalRecordRouter = createTRPCRouter({
  getExternalRecordByClientId: protectedProcedure
    .input(z.number())
    .query(async ({ ctx, input: clientId }) => {
      const data = await ctx.db.query.externalRecords.findFirst({
        where: eq(externalRecords.clientId, clientId),
      });

      if (!data) return null;

      return {
        clientId: data.clientId,
        contentJson: data.content,
        requested: data.requested,
        needsSecondRequest: data.needsSecondRequest,
        secondRequestDate: data.secondRequestDate,
      };
    }),

  setFirstRequestDate: protectedProcedure
    .input(
      z.object({
        clientId: z.number(),
        requested: z.date().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        !hasPermission(ctx.session.user.permissions, "clients:records:create")
      ) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
        });
      }

      const existingRecord = await ctx.db.query.externalRecords.findFirst({
        where: eq(externalRecords.clientId, input.clientId),
      });

      if (!existingRecord) {
        await ctx.db.insert(externalRecords).values({
          clientId: input.clientId,
          requested: input.requested,
        });
      } else {
        await ctx.db
          .update(externalRecords)
          .set({ requested: input.requested })
          .where(eq(externalRecords.clientId, input.clientId));
      }
    }),

  setNeedsSecondRequest: protectedProcedure
    .input(
      z.object({
        clientId: z.number(),
        needsSecondRequest: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        !hasPermission(ctx.session.user.permissions, "clients:records:create")
      ) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
        });
      }

      await ctx.db
        .update(externalRecords)
        .set({ needsSecondRequest: input.needsSecondRequest })
        .where(eq(externalRecords.clientId, input.clientId));
    }),

  setSecondRequestDate: protectedProcedure
    .input(
      z.object({
        clientId: z.number(),
        secondRequestDate: z.date().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        !hasPermission(ctx.session.user.permissions, "clients:records:create")
      ) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
        });
      }

      const updatePayload = {
        secondRequestDate: input.secondRequestDate,
      };

      await ctx.db
        .update(externalRecords)
        .set(updatePayload)
        .where(eq(externalRecords.clientId, input.clientId));
    }),

  updateExternalRecordNote: protectedProcedure
    .input(
      z.object({
        clientId: z.number(),
        contentJson: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        if (
          !hasPermission(ctx.session.user.permissions, "clients:records:create")
        ) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
          });
        }

        await ctx.db.transaction(async (tx) => {
          const currentRecordNote = await tx.query.externalRecords.findFirst({
            where: eq(externalRecords.clientId, input.clientId),
          });

          if (!currentRecordNote) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Note not found",
            });
          }

          await tx.insert(externalRecordHistory).values({
            externalRecordId: currentRecordNote.clientId,
            content: currentRecordNote.content,
            updatedBy: ctx.session.user.email,
          });

          await tx
            .update(externalRecords)
            .set({ content: input.contentJson })
            .where(eq(externalRecords.clientId, input.clientId));
        });

        return { success: true };
      } catch (error) {
        console.error("Update record error:", error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to update record",
          cause: error,
        });
      }
    }),

  createRecordNote: protectedProcedure
    .input(
      z.object({
        clientId: z.number(),
        contentJson: z.any().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        !hasPermission(ctx.session.user.permissions, "clients:records:create")
      ) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
        });
      }

      const notePayload = {
        clientId: input.clientId,
        content: input.contentJson,
      };

      await ctx.db.insert(externalRecords).values(notePayload);

      const newRecordNote = await ctx.db.query.externalRecords.findFirst({
        where: eq(externalRecords.clientId, input.clientId),
      });

      if (!newRecordNote) {
        throw new Error("Failed to retrieve the newly created record.");
      }

      return newRecordNote;
    }),
});

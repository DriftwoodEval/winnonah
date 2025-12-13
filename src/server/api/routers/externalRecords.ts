import EventEmitter from "node:events";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "~/lib/logger";
import { hasPermission } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { externalRecordHistory, externalRecords } from "~/server/db/schema";

const log = logger.child({ module: "ExternalRecordsApi" });

const externalRecordsEmitter = new EventEmitter();
externalRecordsEmitter.setMaxListeners(100);

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
      log.info({ user: ctx.session.user.email }, "Setting first request date");

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

      log.info(
        { user: ctx.session.user.email },
        "Setting needs second request"
      );

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

      log.info({ user: ctx.session.user.email }, "Setting second request date");

      const updatePayload = {
        secondRequestDate: input.secondRequestDate,
      };

      await ctx.db
        .update(externalRecords)
        .set(updatePayload)
        .where(eq(externalRecords.clientId, input.clientId));
    }),

  onExternalRecordNoteUpdate: protectedProcedure
    .input(z.number()) // clientId
    .subscription(async function* ({ input: clientId }) {
      // Create a promise-based queue for events
      const eventQueue: Array<{
        clientId: number;
        // biome-ignore lint/suspicious/noExplicitAny: JSON
        contentJson: any;
        requested: Date | null;
        needsSecondRequest: boolean;
        secondRequestDate: Date | null;
      }> = [];
      let resolveNext: (() => void) | null = null;

      const onUpdate = (data: {
        clientId: number;
        // biome-ignore lint/suspicious/noExplicitAny: JSON
        contentJson: any;
        requested: Date | null;
        needsSecondRequest: boolean;
        secondRequestDate: Date | null;
      }) => {
        // Only queue events for this specific client
        if (data.clientId === clientId) {
          eventQueue.push(data);
          if (resolveNext) {
            resolveNext();
            resolveNext = null;
          }
        }
      };

      externalRecordsEmitter.on("externalRecordsNoteUpdate", onUpdate);

      try {
        while (true) {
          // Wait for an event if queue is empty
          if (eventQueue.length === 0) {
            await new Promise<void>((resolve) => {
              resolveNext = resolve;
            });
          }

          // Yield all queued events
          while (eventQueue.length > 0) {
            const event = eventQueue.shift();
            if (event) {
              yield event;
            }
          }
        }
      } finally {
        // Cleanup when subscription ends
        externalRecordsEmitter.off("externalRecordsNoteUpdate", onUpdate);
      }
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

        log.info(
          { user: ctx.session.user.email },
          "Updating external records note"
        );

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

          if (currentRecordNote.content !== null) {
            await tx.insert(externalRecordHistory).values({
              externalRecordId: currentRecordNote.clientId,
              content: currentRecordNote.content,
              updatedBy: ctx.session.user.email,
            });
          }

          await tx
            .update(externalRecords)
            .set({ content: input.contentJson })
            .where(eq(externalRecords.clientId, input.clientId));
        });

        const updatedNote = await ctx.db.query.externalRecords.findFirst({
          where: eq(externalRecords.clientId, input.clientId),
        });

        if (updatedNote) {
          externalRecordsEmitter.emit("externalRecordsNoteUpdate", {
            clientId: updatedNote.clientId,
            contentJson: updatedNote.content,
            requested: updatedNote.requested,
            needsSecondRequest: updatedNote.needsSecondRequest,
            secondRequestDate: updatedNote.secondRequestDate,
          });
        }

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

      log.info(
        { user: ctx.session.user.email },
        "Creating external records note"
      );

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

      externalRecordsEmitter.emit("externalRecordsNoteUpdate", {
        clientId: newRecordNote.clientId,
        contentJson: newRecordNote.content,
        requested: newRecordNote.requested,
        needsSecondRequest: newRecordNote.needsSecondRequest,
        secondRequestDate: newRecordNote.secondRequestDate,
      });

      return newRecordNote;
    }),
});

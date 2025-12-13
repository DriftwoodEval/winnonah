import { EventEmitter } from "node:events";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "~/lib/logger";
import { hasPermission } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { noteHistory, notes } from "~/server/db/schema";

const log = logger.child({ module: "NoteApi" });

const noteEmitter = new EventEmitter();
noteEmitter.setMaxListeners(100);

export const noteRouter = createTRPCRouter({
  getNoteByClientId: protectedProcedure
    .input(z.number())
    .query(async ({ ctx, input: clientId }) => {
      const data = await ctx.db.query.notes.findFirst({
        where: eq(notes.clientId, clientId),
      });

      if (!data) return null;

      return {
        clientId: data.clientId,
        contentJson: data.content,
        title: data.title,
      };
    }),

  onNoteUpdate: protectedProcedure
    .input(z.number()) // clientId
    .subscription(async function* ({ input: clientId }) {
      // Create a promise-based queue for events
      const eventQueue: Array<{
        clientId: number;
        // biome-ignore lint/suspicious/noExplicitAny: JSON
        contentJson: any;
        title: string | null;
      }> = [];
      let resolveNext: (() => void) | null = null;

      const onUpdate = (data: {
        clientId: number;
        // biome-ignore lint/suspicious/noExplicitAny: JSON
        contentJson: any;
        title: string | null;
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

      noteEmitter.on("noteUpdate", onUpdate);

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
        noteEmitter.off("noteUpdate", onUpdate);
      }
    }),

  updateNote: protectedProcedure
    .input(
      z.object({
        clientId: z.number(),
        contentJson: z.any().optional(),
        title: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        if (!hasPermission(ctx.session.user.permissions, "clients:notes")) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
          });
        }
        log.info({ user: ctx.session.user.email }, "Updating note");

        await ctx.db.transaction(async (tx) => {
          const currentNote = await tx.query.notes.findFirst({
            where: eq(notes.clientId, input.clientId),
          });

          if (!currentNote) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Note not found",
            });
          }

          await tx.insert(noteHistory).values({
            noteId: currentNote.clientId,
            content: currentNote.content,
            title: currentNote.title,
            updatedBy: ctx.session.user.email,
          });

          // biome-ignore lint/suspicious/noExplicitAny: JSON
          const updatePayload: { content?: any; title?: string } = {};
          if (input.contentJson !== undefined) {
            updatePayload.content = input.contentJson;
          }
          if (input.title !== undefined) {
            updatePayload.title = input.title;
          }

          await tx
            .update(notes)
            .set(updatePayload)
            .where(eq(notes.clientId, input.clientId));
        });

        const updatedNote = await ctx.db.query.notes.findFirst({
          where: eq(notes.clientId, input.clientId),
        });

        if (updatedNote) {
          noteEmitter.emit("noteUpdate", {
            clientId: updatedNote.clientId,
            contentJson: updatedNote.content,
            title: updatedNote.title,
          });
        }

        return { success: true };
      } catch (error) {
        console.error("Update note error:", error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to update note",
          cause: error,
        });
      }
    }),

  createNote: protectedProcedure
    .input(
      z.object({
        clientId: z.number(),
        contentJson: z.any().optional(),
        title: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasPermission(ctx.session.user.permissions, "clients:notes")) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
        });
      }

      log.info({ user: ctx.session.user.email }, "Creating note");

      const notePayload = {
        clientId: input.clientId,
        content: input.contentJson,
        title: input.title,
      };

      await ctx.db.insert(notes).values(notePayload);

      const newNote = await ctx.db.query.notes.findFirst({
        where: eq(notes.clientId, input.clientId),
      });

      if (!newNote) {
        throw new Error("Failed to retrieve the newly created note.");
      }

      noteEmitter.emit("noteUpdate", {
        clientId: newNote.clientId,
        contentJson: newNote.content,
        title: newNote.title,
      });

      return newNote;
    }),
});

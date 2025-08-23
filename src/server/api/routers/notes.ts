import { eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { noteHistory, notes } from "~/server/db/schema";

export const noteRouter = createTRPCRouter({
  getNoteByClientId: protectedProcedure
    .input(z.number())
    .query(async ({ ctx, input: clientId }) => {
      const data = await ctx.db.query.notes.findFirst({
        where: eq(notes.clientId, clientId),
      });

      if (!data) return null;

      return {
        id: data.clientId,
        contentJson: data.content,
      };
    }),

  updateNote: protectedProcedure
    .input(
      z.object({
        noteId: z.number(),
        contentJson: z.any(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        const currentNote = await tx.query.notes.findFirst({
          where: eq(notes.clientId, input.noteId),
        });

        if (!currentNote) {
          throw new Error("Note not found");
        }

        await tx.insert(noteHistory).values({
          noteId: currentNote.clientId,
          content: currentNote.content,
          updatedBy: ctx.session.user.id,
        });

        await tx
          .update(notes)
          .set({
            content: input.contentJson,
          })
          .where(eq(notes.clientId, input.noteId));
      });

      return { success: true };
    }),

  createNote: protectedProcedure
    .input(
      z.object({
        clientId: z.number(),
        contentJson: z.any(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const resultHeader = await ctx.db.insert(notes).values({
        clientId: input.clientId,
        content: input.contentJson,
      });

      const newNoteId = resultHeader[0].insertId;

      if (!newNoteId) {
        throw new Error("Failed to create note: could not retrieve insert ID.");
      }

      const newNote = await ctx.db.query.notes.findFirst({
        where: eq(notes.clientId, newNoteId),
      });

      return newNote;
    }),
});

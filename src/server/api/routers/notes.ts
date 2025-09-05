import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
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
        title: data.title,
      };
    }),

  updateNote: adminProcedure
    .input(
      z.object({
        noteId: z.number(),
        contentJson: z.any().optional(),
        title: z.string().optional(),
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
          title: currentNote.title,
          updatedBy: ctx.session.user.id,
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
          .where(eq(notes.clientId, input.noteId));
      });

      return { success: true };
    }),

  createNote: adminProcedure
    .input(
      z.object({
        clientId: z.number(),
        contentJson: z.any().optional(),
        title: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const notePayload = {
        clientId: input.clientId,
        content: input.contentJson,
        title: input.title,
      };

      const resultHeader = await ctx.db.insert(notes).values(notePayload);

      const newNoteId = resultHeader[0]?.insertId;

      if (!newNoteId) {
        throw new Error("Failed to create note: could not retrieve insert ID.");
      }

      const newNote = await ctx.db.query.notes.findFirst({
        where: eq(notes.clientId, newNoteId),
      });

      if (!newNote) {
        throw new Error("Failed to retrieve the newly created note.");
      }

      return newNote;
    }),
});

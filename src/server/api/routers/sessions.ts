// In your tRPC router (e.g., ~/server/api/routers/session.ts)

import { eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { sessions } from "~/server/db/schema";

export const sessionRouter = createTRPCRouter({
  getClientFilters: protectedProcedure.query(async ({ ctx }) => {
    const session = await ctx.db.query.sessions.findFirst({
      where: eq(sessions.userId, ctx.session.user.id),
      orderBy: (sessions, { desc }) => [desc(sessions.expires)],
    });

    return {
      clientFilters: session?.clientFilters ?? null,
    };
  }),

  saveClientFilters: protectedProcedure
    .input(z.object({ clientFilters: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Find the current session
      const currentSession = await ctx.db.query.sessions.findFirst({
        where: eq(sessions.userId, ctx.session.user.id),
        orderBy: (sessions, { desc }) => [desc(sessions.expires)],
      });

      if (!currentSession) {
        throw new Error("Session not found");
      }

      // Update the session with the filters
      await ctx.db
        .update(sessions)
        .set({ clientFilters: input.clientFilters })
        .where(eq(sessions.sessionToken, currentSession.sessionToken));

      return { success: true };
    }),
});

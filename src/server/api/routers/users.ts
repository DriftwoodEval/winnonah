import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import z from "zod";
import { type UserRole, userRoles } from "~/lib/types";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { users } from "~/server/db/schema";
export const userRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const users = await ctx.db.query.users.findMany({
      orderBy: (users, { desc }) => [desc(users.name)],
    });

    return users;
  }),

  getOne: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `User with ID ${input.userId} not found`,
        });
      }

      return user;
    }),

  updateUser: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(userRoles).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: { role?: UserRole } = {};

      if (input.role !== undefined) updateData.role = input.role;

      await ctx.db
        .update(users)
        .set(updateData)
        .where(eq(users.id, input.userId));

      const updatedUser = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.userId),
      });

      if (!updatedUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `User with ID ${input.userId} not found`,
        });
      }

      return updatedUser;
    }),
});

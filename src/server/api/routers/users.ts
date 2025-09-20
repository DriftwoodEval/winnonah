import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import z from "zod";
import { type UserRole, userRoles } from "~/lib/types";
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";
import { invitations, users } from "~/server/db/schema";
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

  updateUser: adminProcedure
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

  createInvitation: adminProcedure
    .input(z.object({ email: z.email(), role: z.enum(userRoles) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.user.role !== "superadmin") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
        });
      }

      await ctx.db
        .insert(invitations)
        .values({ email: input.email, role: input.role });

      return {
        success: true,
        message: `Invitation created for ${input.email}`,
      };
    }),

  getPendingInvitations: protectedProcedure.query(async ({ ctx }) => {
    const pendingInvitations = await ctx.db.query.invitations.findMany({
      where: eq(invitations.status, "pending"),
      orderBy: (invitations, { desc }) => [desc(invitations.createdAt)],
    });
    return pendingInvitations;
  }),

  deleteInvitation: adminProcedure
    .input(
      z.object({
        id: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => ({
      success: await ctx.db
        .delete(invitations)
        .where(eq(invitations.id, input.id)),
    })),

  getSavedPlaces: protectedProcedure.query(async ({ ctx }) => {
    const userFromDb = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.session.user.id),
    });

    if (!userFromDb) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `User with ID ${ctx.session.user.id} not found`,
      });
    }

    const savedPlaces = JSON.parse(
      userFromDb.savedPlaces?.toString() || "{}"
    ) as Record<string, string>;

    return savedPlaces;
  }),

  updateSavedPlaces: protectedProcedure
    .input(z.object({ hash: z.string(), key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userFromDb = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.session.user.id),
      });

      if (!userFromDb) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `User with ID ${ctx.session.user.id} not found`,
        });
      }

      const savedPlaces = JSON.parse(
        userFromDb.savedPlaces?.toString() || "{}"
      );

      savedPlaces[input.key] = input.hash;

      await ctx.db
        .update(users)
        .set({
          savedPlaces: JSON.stringify(savedPlaces),
        })
        .where(eq(users.id, ctx.session.user.id));

      const updatedUser = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.session.user.id),
      });

      if (!updatedUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `User with ID ${ctx.session.user.id} not found`,
        });
      }

      const updatedSavedPlaces = JSON.parse(
        updatedUser.savedPlaces?.toString() || "{}"
      );

      return updatedSavedPlaces;
    }),

  deleteSavedPlace: protectedProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userFromDb = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.session.user.id),
      });

      if (!userFromDb) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `User with ID ${ctx.session.user.id} not found`,
        });
      }

      const savedPlaces = JSON.parse(
        userFromDb.savedPlaces?.toString() || "{}"
      );

      delete savedPlaces[input.key];

      await ctx.db
        .update(users)
        .set({
          savedPlaces: JSON.stringify(savedPlaces),
        })
        .where(eq(users.id, ctx.session.user.id));

      const updatedUser = await ctx.db.query.users.findFirst({
        where: eq(users.id, ctx.session.user.id),
      });

      if (!updatedUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `User with ID ${ctx.session.user.id} not found`,
        });
      }

      const updatedSavedPlaces = JSON.parse(
        updatedUser.savedPlaces?.toString() || "{}"
      );

      return updatedSavedPlaces;
    }),
});

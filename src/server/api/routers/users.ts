import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import z from "zod";
import { logger } from "~/lib/logger";
import { type PermissionsObject, permissionsSchema } from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { invitations, users } from "~/server/db/schema";

const log = logger.child({ module: "UsersApi" });
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
        permissions: permissionsSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!hasPermission(ctx.session.user.permissions, "settings:users:edit")) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
        });
      }

      log.info({ user: ctx.session.user.email, ...input }, "Updating user");

      const updateData: { permissions?: PermissionsObject } = {};

      if (input.permissions !== undefined)
        updateData.permissions = input.permissions;

      if (Object.keys(updateData).length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No data provided to update.",
        });
      }

      await ctx.db
        .update(users)
        .set(updateData)
        .where(eq(users.id, input.userId));
    }),

  createInvitation: protectedProcedure
    .input(z.object({ email: z.email(), permissions: permissionsSchema }))
    .mutation(async ({ ctx, input }) => {
      if (
        !hasPermission(ctx.session.user.permissions, "settings:users:invite")
      ) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
        });
      }

      log.info(
        { user: ctx.session.user.email, ...input },
        "Creating invitation"
      );

      await ctx.db
        .insert(invitations)
        .values({ email: input.email, permissions: input.permissions });

      return {
        success: true,
        message: `Invitation created for ${input.email}`,
      };
    }),

  getPendingInvitations: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.db.query.invitations.findMany({
      where: eq(invitations.status, "pending"),
      orderBy: (invitations, { desc }) => [desc(invitations.createdAt)],
    });
  }),

  deleteInvitation: protectedProcedure
    .input(
      z.object({
        id: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        !hasPermission(ctx.session.user.permissions, "settings:users:invite")
      ) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
        });
      }

      log.info(
        { user: ctx.session.user.email, ...input },
        "Deleting invitation"
      );

      return {
        success: await ctx.db
          .delete(invitations)
          .where(eq(invitations.id, input.id)),
      };
    }),

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
    ) as Record<string, { hash: string; index?: number }>;

    return savedPlaces;
  }),

  updateSavedPlaces: protectedProcedure
    .input(
      z.object({
        key: z.string(),
        hash: z.string(),
        index: z.number().optional(),
      })
    )
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
      ) as Record<string, string | { hash: string; index?: number }>;

      savedPlaces[input.key] = { hash: input.hash, index: input.index };

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

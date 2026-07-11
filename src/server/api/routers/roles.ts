import { TRPCError } from "@trpc/server";
import { eq, ne } from "drizzle-orm";
import z from "zod";
import { permissionsSchema } from "~/lib/types";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { invitations, roles, users } from "~/server/db/schema";

export const rolesRouter = createTRPCRouter({
	getAll: protectedProcedure.query(async ({ ctx }) => {
		return await ctx.db.query.roles.findMany({
			orderBy: (roles, { asc }) => [asc(roles.name)],
		});
	}),

	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				permissions: permissionsSchema,
				isDefault: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:roles:edit");

			ctx.logger.info(input, "Creating role");

			await ctx.db.transaction(async (tx) => {
				if (input.isDefault) {
					await tx.update(roles).set({ isDefault: false });
				}
				await tx.insert(roles).values({
					name: input.name,
					permissions: input.permissions,
					isDefault: input.isDefault ?? false,
				});
			});
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.number(),
				name: z.string().min(1).optional(),
				permissions: permissionsSchema.optional(),
				isDefault: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:roles:edit");

			ctx.logger.info(input, "Updating role");

			await ctx.db.transaction(async (tx) => {
				if (input.isDefault) {
					await tx
						.update(roles)
						.set({ isDefault: false })
						.where(ne(roles.id, input.id));
				}
				await tx
					.update(roles)
					.set({
						...(input.name !== undefined && { name: input.name }),
						...(input.permissions !== undefined && {
							permissions: input.permissions,
						}),
						...(input.isDefault !== undefined && {
							isDefault: input.isDefault,
						}),
					})
					.where(eq(roles.id, input.id));
			});
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:roles:edit");

			const role = await ctx.db.query.roles.findFirst({
				where: eq(roles.id, input.id),
			});

			if (!role) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Role not found" });
			}

			if (role.isDefault) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Can't delete the default role. Set another role as default first.",
				});
			}

			const [assignedUsers, assignedInvitations] = await Promise.all([
				ctx.db.query.users.findMany({ where: eq(users.roleId, input.id) }),
				ctx.db.query.invitations.findMany({
					where: eq(invitations.roleId, input.id),
				}),
			]);

			const assignedCount = assignedUsers.length + assignedInvitations.length;
			if (assignedCount > 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `${assignedCount} ${assignedCount === 1 ? "person is" : "people are"} still assigned to this role. Reassign them before deleting it.`,
				});
			}

			ctx.logger.info(input, "Deleting role");

			await ctx.db.delete(roles).where(eq(roles.id, input.id));
		}),
});

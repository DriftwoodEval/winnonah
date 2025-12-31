import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import z from "zod";
import { logger } from "~/lib/logger";
import { hasPermission } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { testUnits } from "~/server/db/schema";

const log = logger.child({ module: "TestUnitsApi" });

export const testUnitsRouter = createTRPCRouter({
	getAll: protectedProcedure.query(async ({ ctx }) => {
		return await ctx.db.query.testUnits.findMany({});
	}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.number(),
				name: z.string(),
				minutes: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!hasPermission(ctx.session.user.permissions, "settings:testUnits")) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			log.info(
				{ user: ctx.session.user.email, ...input },
				"Updating test unit",
			);

			return await ctx.db
				.update(testUnits)
				.set({
					name: input.name,
					minutes: input.minutes,
				})
				.where(eq(testUnits.id, input.id));
		}),

	add: protectedProcedure
		.input(
			z.object({
				name: z.string(),
				minutes: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!hasPermission(ctx.session.user.permissions, "settings:testUnits")) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			log.info(
				{ user: ctx.session.user.email, ...input },
				"Creating test unit",
			);

			return await ctx.db.insert(testUnits).values({
				name: input.name,
				minutes: input.minutes,
			});
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			if (!hasPermission(ctx.session.user.permissions, "settings:testUnits")) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			log.info(
				{ user: ctx.session.user.email, ...input },
				"Deleting test unit",
			);

			return await ctx.db.delete(testUnits).where(eq(testUnits.id, input.id));
		}),
});

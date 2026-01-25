import { eq } from "drizzle-orm";
import z from "zod";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { testUnits } from "~/server/db/schema";

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
			assertPermission(ctx.session.user, "settings:testUnits");

			ctx.logger.info(input, "Updating test unit");

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
			assertPermission(ctx.session.user, "settings:testUnits");

			ctx.logger.info(input, "Creating test unit");

			return await ctx.db.insert(testUnits).values({
				name: input.name,
				minutes: input.minutes,
			});
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:testUnits");

			ctx.logger.info(input, "Deleting test unit");

			return await ctx.db.delete(testUnits).where(eq(testUnits.id, input.id));
		}),
});

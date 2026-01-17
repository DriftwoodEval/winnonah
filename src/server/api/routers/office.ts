import { z } from "zod";
import { fetchWithCache } from "~/lib/cache";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const officeRouter = createTRPCRouter({
	getAll: protectedProcedure.query(async ({ ctx }) => {
		const cacheKey = "offices:all";

		return fetchWithCache(ctx, cacheKey, () => {
			return ctx.db.query.offices.findMany({});
		});
	}),

	getOne: protectedProcedure
		.input(
			z.object({
				column: z.enum(["key", "prettyName"]),
				value: z.string().min(1),
			}),
		)
		.query(async ({ ctx, input }) => {
			const cacheKey = `office:${input.column}:${input.value}`;

			return fetchWithCache(ctx, cacheKey, async () => {
				const office = await ctx.db.query.offices.findFirst({
					where: (o, { eq }) => eq(o[input.column], input.value),
				});

				if (!office) {
					throw new Error("Office not found");
				}

				return office;
			});
		}),
});

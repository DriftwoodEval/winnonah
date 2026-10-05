import { eq } from "drizzle-orm";
import { z } from "zod";
import { fetchWithCache, invalidateCache } from "~/lib/cache";
import { CACHE_KEY_ALL_EVALUATORS } from "~/server/api/routers/evaluator";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { offices } from "~/server/db/schema";

const CACHE_KEY_ALL_OFFICES = "offices:all";

export const officeRouter = createTRPCRouter({
	// Archived offices are left out unless asked for: pickers want only active
	// offices, while name lookups for past data need every office.
	getAll: protectedProcedure
		.input(z.object({ includeArchived: z.boolean().default(false) }).optional())
		.query(async ({ ctx, input }) => {
			const allOffices = await fetchWithCache(
				ctx,
				CACHE_KEY_ALL_OFFICES,
				() => {
					return ctx.db.query.offices.findMany({});
				},
			);

			return input?.includeArchived
				? allOffices
				: allOffices.filter((office) => !office.archived);
		}),

	setArchived: protectedProcedure
		.input(z.object({ key: z.string(), archived: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:evaluators");
			ctx.logger.info(
				{ ...input, changedBy: ctx.session.user.email },
				input.archived ? "Archiving office" : "Unarchiving office",
			);
			await ctx.db
				.update(offices)
				.set({ archived: input.archived })
				.where(eq(offices.key, input.key));
			await invalidateCache(
				ctx,
				CACHE_KEY_ALL_OFFICES,
				CACHE_KEY_ALL_EVALUATORS,
			);
		}),

	updateLocationPhrase: protectedProcedure
		.input(z.object({ key: z.string(), locationPhrase: z.string().nullable() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db
				.update(offices)
				.set({ locationPhrase: input.locationPhrase })
				.where(eq(offices.key, input.key));
			await invalidateCache(ctx, CACHE_KEY_ALL_OFFICES);
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

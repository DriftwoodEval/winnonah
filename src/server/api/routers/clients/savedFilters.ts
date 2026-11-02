import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { SavedFilters } from "~/lib/saved-filters";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import type { db } from "~/server/db";
import { users } from "~/server/db/schema";

type Db = typeof db;

const schedulingType = z.enum(["active", "archived"]);

async function readSavedFilters(
	database: Db,
	userId: string,
): Promise<SavedFilters> {
	const row = await database.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { savedFilters: true },
	});
	return row?.savedFilters ?? {};
}

/**
 * Merges `patch` into the user's saved filters in a single UPDATE, so filters
 * saved at the same moment from different tables cannot overwrite each other.
 */
async function patchSavedFilters(
	ctx: { db: Db; session: { user: { id: string; isImpersonating: boolean } } },
	patch: SavedFilters,
) {
	// Viewing as someone must not change that person's saved filters.
	if (ctx.session.user.isImpersonating) return { success: true };

	await ctx.db
		.update(users)
		.set({
			savedFilters: sql`JSON_MERGE_PATCH(COALESCE(${users.savedFilters}, JSON_OBJECT()), CAST(${JSON.stringify(patch)} AS JSON))`,
		})
		.where(eq(users.id, ctx.session.user.id));
	return { success: true };
}

export const savedFiltersRouter = createTRPCRouter({
	getClientFilters: protectedProcedure.query(async ({ ctx }) => {
		const filters = await readSavedFilters(ctx.db, ctx.session.user.id);
		return { clientFilters: filters.clientFilters ?? null };
	}),

	saveClientFilters: protectedProcedure
		.input(z.object({ clientFilters: z.string() }))
		.mutation(({ ctx, input }) => patchSavedFilters(ctx, input)),

	getDirectoryFilters: protectedProcedure.query(async ({ ctx }) => {
		const filters = await readSavedFilters(ctx.db, ctx.session.user.id);
		return { directoryFilters: filters.directoryFilters ?? null };
	}),

	saveDirectoryFilters: protectedProcedure
		.input(z.object({ directoryFilters: z.string() }))
		.mutation(({ ctx, input }) => patchSavedFilters(ctx, input)),

	getReportsFilters: protectedProcedure.query(async ({ ctx }) => {
		const filters = await readSavedFilters(ctx.db, ctx.session.user.id);
		return { reportsFilters: filters.reportsFilters ?? null };
	}),

	saveReportsFilters: protectedProcedure
		.input(z.object({ reportsFilters: z.string() }))
		.mutation(({ ctx, input }) => patchSavedFilters(ctx, input)),

	getSchedulingFilters: protectedProcedure
		.input(z.object({ type: schedulingType }))
		.query(async ({ ctx, input }) => {
			const filters = await readSavedFilters(ctx.db, ctx.session.user.id);
			return { schedulingFilters: filters.scheduling?.[input.type] ?? null };
		}),

	saveSchedulingFilters: protectedProcedure
		.input(z.object({ type: schedulingType, schedulingFilters: z.string() }))
		.mutation(({ ctx, input }) =>
			patchSavedFilters(ctx, {
				scheduling: { [input.type]: input.schedulingFilters },
			}),
		),
});

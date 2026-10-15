import { and, eq, notInArray } from "drizzle-orm";
import z from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { listDismissals } from "~/server/db/schema";

export const listDismissalsRouter = createTRPCRouter({
	/** The current user's dismissals across all lists. */
	list: protectedProcedure.query(({ ctx }) =>
		ctx.db
			.select({
				listKey: listDismissals.listKey,
				clientId: listDismissals.clientId,
				note: listDismissals.note,
			})
			.from(listDismissals)
			.where(eq(listDismissals.userId, ctx.session.user.id)),
	),

	dismiss: protectedProcedure
		.input(
			z.object({
				listKey: z.string().min(1).max(255),
				clientId: z.number(),
				note: z.string().trim().max(500).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const note = input.note || null;
			await ctx.db
				.insert(listDismissals)
				.values({ userId: ctx.session.user.id, ...input, note })
				.onDuplicateKeyUpdate({ set: { note } });
		}),

	restore: protectedProcedure
		.input(z.object({ listKey: z.string(), clientId: z.number() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db
				.delete(listDismissals)
				.where(
					and(
						eq(listDismissals.userId, ctx.session.user.id),
						eq(listDismissals.listKey, input.listKey),
						eq(listDismissals.clientId, input.clientId),
					),
				);
		}),

	/**
	 * Deletes the user's dismissals for clients no longer in the list, so a
	 * client that moves out and later returns shows up again.
	 */
	prune: protectedProcedure
		.input(
			z.object({
				listKey: z.string(),
				currentClientIds: z.array(z.number()),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const scope = and(
				eq(listDismissals.userId, ctx.session.user.id),
				eq(listDismissals.listKey, input.listKey),
			);
			await ctx.db
				.delete(listDismissals)
				.where(
					input.currentClientIds.length === 0
						? scope
						: and(
								scope,
								notInArray(listDismissals.clientId, input.currentClientIds),
							),
				);
		}),
});

import { desc, eq } from "drizzle-orm";
import z from "zod";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import {
	faxCategorizationClientLinks,
	faxCategorizations,
} from "~/server/db/schema";

const CATEGORIES = [
	"Referral",
	"Records Request",
	"Insurance",
	"Patient Documents",
	"Unsure",
] as const;

export const faxCategorizationRouter = createTRPCRouter({
	list: protectedProcedure
		.input(z.object({ status: z.enum(["pending", "reviewed"]).optional() }))
		.query(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "fax:categorization:review");
			return ctx.db.query.faxCategorizations.findMany({
				where: input.status
					? eq(faxCategorizations.status, input.status)
					: undefined,
				with: { links: { with: { client: true } } },
				orderBy: [desc(faxCategorizations.discoveredAt)],
			});
		}),

	confirmLink: protectedProcedure
		.input(
			z.object({
				faxCategorizationId: z.number(),
				clientId: z.number(),
				source: z.enum(["llm", "manual"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "fax:categorization:review");
			await ctx.db
				.insert(faxCategorizationClientLinks)
				.values({
					faxCategorizationId: input.faxCategorizationId,
					clientId: input.clientId,
					source: input.source,
					confirmed: true,
					reviewedBy: ctx.session.user.email,
				})
				.onDuplicateKeyUpdate({
					set: { confirmed: true, reviewedBy: ctx.session.user.email },
				});
			return { success: true };
		}),

	rejectLink: protectedProcedure
		.input(z.object({ linkId: z.number() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "fax:categorization:review");
			await ctx.db
				.delete(faxCategorizationClientLinks)
				.where(eq(faxCategorizationClientLinks.id, input.linkId));
			return { success: true };
		}),

	markReviewed: protectedProcedure
		.input(
			z.object({
				faxCategorizationId: z.number(),
				category: z.enum(CATEGORIES),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "fax:categorization:review");
			await ctx.db
				.update(faxCategorizations)
				.set({
					category: input.category,
					status: "reviewed",
					reviewedAt: new Date(),
					reviewedBy: ctx.session.user.email,
				})
				.where(eq(faxCategorizations.id, input.faxCategorizationId));
			return { success: true };
		}),
});

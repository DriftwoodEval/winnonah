import { desc, eq } from "drizzle-orm";
import z from "zod";
import { getDriveClient } from "~/lib/google";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import {
	clients,
	referralFaxClientLinks,
	referralFaxes,
} from "~/server/db/schema";

export const referralFaxRouter = createTRPCRouter({
	getClientDriveFiles: protectedProcedure
		.input(z.object({ clientId: z.number() }))
		.query(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "referrals:fax:review");

			const client = await ctx.db.query.clients.findFirst({
				where: eq(clients.id, input.clientId),
				columns: { driveId: true },
			});

			if (!client?.driveId) {
				return { files: [] };
			}

			const driveApi = getDriveClient(ctx.session);
			const response = await driveApi.files.list({
				q: `'${client.driveId}' in parents and trashed = false`,
				fields: "files(id, name, webViewLink)",
			});

			return { files: response.data.files ?? [] };
		}),

	list: protectedProcedure
		.input(z.object({ status: z.enum(["pending", "reviewed"]).optional() }))
		.query(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "referrals:fax:review");
			return ctx.db.query.referralFaxes.findMany({
				where: input.status
					? eq(referralFaxes.status, input.status)
					: undefined,
				with: { links: { with: { client: true } } },
				orderBy: [desc(referralFaxes.discoveredAt)],
			});
		}),

	confirmLink: protectedProcedure
		.input(
			z.object({
				faxId: z.number(),
				clientId: z.number(),
				source: z.enum(["llm", "manual"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "referrals:fax:review");
			await ctx.db
				.insert(referralFaxClientLinks)
				.values({
					faxId: input.faxId,
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
			assertPermission(ctx.session.user, "referrals:fax:review");
			await ctx.db
				.delete(referralFaxClientLinks)
				.where(eq(referralFaxClientLinks.id, input.linkId));
			return { success: true };
		}),

	markReviewed: protectedProcedure
		.input(z.object({ faxId: z.number() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "referrals:fax:review");
			await ctx.db
				.update(referralFaxes)
				.set({
					status: "reviewed",
					reviewedAt: new Date(),
					reviewedBy: ctx.session.user.email,
				})
				.where(eq(referralFaxes.id, input.faxId));
			return { success: true };
		}),
});

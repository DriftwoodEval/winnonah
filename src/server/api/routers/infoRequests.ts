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
	infoRequestClientLinks,
	infoRequests,
} from "~/server/db/schema";

export const infoRequestsRouter = createTRPCRouter({
	getClientDriveFiles: protectedProcedure
		.input(z.object({ clientId: z.number() }))
		.query(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "info-requests:review");

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
			assertPermission(ctx.session.user, "info-requests:review");
			return ctx.db.query.infoRequests.findMany({
				where: input.status ? eq(infoRequests.status, input.status) : undefined,
				with: { links: { with: { client: true } } },
				orderBy: [desc(infoRequests.discoveredAt)],
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
			assertPermission(ctx.session.user, "info-requests:review");
			await ctx.db
				.insert(infoRequestClientLinks)
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
			assertPermission(ctx.session.user, "info-requests:review");
			await ctx.db
				.delete(infoRequestClientLinks)
				.where(eq(infoRequestClientLinks.id, input.linkId));
			return { success: true };
		}),

	markReviewed: protectedProcedure
		.input(z.object({ faxId: z.number() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "info-requests:review");
			await ctx.db
				.update(infoRequests)
				.set({
					status: "reviewed",
					reviewedAt: new Date(),
					reviewedBy: ctx.session.user.email,
				})
				.where(eq(infoRequests.id, input.faxId));
			return { success: true };
		}),
});

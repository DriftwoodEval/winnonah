import { eq } from "drizzle-orm";
import z from "zod";
import { getDriveClient } from "~/lib/integrations/google";
import { setAuditDetail } from "~/server/api/audit";
import { createTRPCRouter, permissionProcedure } from "~/server/api/trpc";
import type { db } from "~/server/db";
import { clients, ddsFaxRequests } from "~/server/db/schema";

type FileChoice = {
	selectedFileId: string | null;
	selectedFileName: string | null;
	coverNote: string | null;
};

/** Logs the request's file/cover-note choice before and after; setting one clears the other. */
async function setChoiceAuditDetail(
	ctx: Parameters<typeof setAuditDetail>[0] & { db: typeof db },
	id: number,
	after: FileChoice,
) {
	const before = await ctx.db.query.ddsFaxRequests.findFirst({
		where: eq(ddsFaxRequests.id, id),
		columns: { selectedFileId: true, selectedFileName: true, coverNote: true },
	});
	setAuditDetail(ctx, { id, before: before ?? null, after });
}

export const ddsQueueRouter = createTRPCRouter({
	decide: permissionProcedure("issues:dds-requests")
		.input(
			z.object({
				id: z.number(),
				status: z.enum(["approved", "denied"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await ctx.db
				.update(ddsFaxRequests)
				.set({
					status: input.status,
					decidedAt: new Date(),
					decidedBy: ctx.session.user.email,
				})
				.where(eq(ddsFaxRequests.id, input.id));
		}),

	/** PDFs in the client's Drive folder, newest first, for swapping the selection. */
	listClientPdfs: permissionProcedure("issues:dds-requests")
		.input(z.object({ clientId: z.number() }))
		.query(async ({ ctx, input }) => {
			const client = await ctx.db.query.clients.findFirst({
				where: eq(clients.id, input.clientId),
				columns: { driveId: true },
			});
			if (!client?.driveId || client.driveId === "N/A") return [];

			const response = await getDriveClient(ctx.session).files.list({
				q: `'${client.driveId}' in parents and mimeType = 'application/pdf' and trashed = false`,
				orderBy: "modifiedTime desc",
				pageSize: 100,
				fields: "files(id, name)",
			});
			return (response.data.files ?? []).flatMap((file) =>
				file.id && file.name ? [{ id: file.id, name: file.name }] : [],
			);
		}),

	setFile: permissionProcedure("issues:dds-requests")
		.input(
			z.object({
				id: z.number(),
				fileId: z.string().min(1),
				fileName: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await setChoiceAuditDetail(ctx, input.id, {
				selectedFileId: input.fileId,
				selectedFileName: input.fileName,
				coverNote: null,
			});
			await ctx.db
				.update(ddsFaxRequests)
				.set({
					selectedFileId: input.fileId,
					selectedFileName: input.fileName,
					coverNote: null,
				})
				.where(eq(ddsFaxRequests.id, input.id));
		}),

	/** Sends the cover page alone with this note at its bottom, instead of a PDF. */
	setCoverNote: permissionProcedure("issues:dds-requests")
		.input(z.object({ id: z.number(), note: z.string().trim().min(1) }))
		.mutation(async ({ ctx, input }) => {
			await setChoiceAuditDetail(ctx, input.id, {
				selectedFileId: null,
				selectedFileName: null,
				coverNote: input.note,
			});
			await ctx.db
				.update(ddsFaxRequests)
				.set({
					selectedFileId: null,
					selectedFileName: null,
					coverNote: input.note,
				})
				.where(eq(ddsFaxRequests.id, input.id));
		}),
});

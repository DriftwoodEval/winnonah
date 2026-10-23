import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { ISSUE_REPORT_EMAIL } from "~/lib/constants";
import { GmailScopeError, sendGmailAsUser } from "~/lib/integrations/gmail";
import { hasPermission } from "~/lib/utils";
import {
	issueReportRecipientsSchema,
	issueReportSubmissionSchema,
} from "~/lib/validations/config";
import { diffValues, setAuditDetail } from "~/server/api/audit";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import type { db } from "~/server/db";
import { pythonConfig } from "~/server/db/schema";

const RECIPIENTS_CONFIG_ID = 4;
const EDIT_PERMISSION = "settings:issue-report:edit";

async function loadRecipients(database: typeof db) {
	const record = await database.query.pythonConfig.findFirst({
		where: eq(pythonConfig.id, RECIPIENTS_CONFIG_ID),
	});
	const parsed = issueReportRecipientsSchema.safeParse(record?.data);
	return parsed.success ? parsed.data : { recipients: [] };
}

export const issueReportRouter = createTRPCRouter({
	// Any signed-in user can pick from the list when sending a report.
	getRecipients: protectedProcedure.query(({ ctx }) => loadRecipients(ctx.db)),

	setRecipients: protectedProcedure
		.input(issueReportRecipientsSchema)
		.mutation(async ({ ctx, input }) => {
			if (!hasPermission(ctx.session.user.permissions, EDIT_PERMISSION)) {
				throw new TRPCError({ code: "FORBIDDEN" });
			}
			setAuditDetail(ctx, diffValues(await loadRecipients(ctx.db), input));
			await ctx.db
				.insert(pythonConfig)
				.values({ id: RECIPIENTS_CONFIG_ID, data: input })
				.onDuplicateKeyUpdate({ set: { data: input } });
			return { success: true };
		}),

	send: protectedProcedure
		.input(issueReportSubmissionSchema)
		.mutation(async ({ ctx, input }) => {
			const { user } = ctx.session;
			if (user.isImpersonating) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Stop viewing as another user before sending a report.",
				});
			}

			const { recipients } = await loadRecipients(ctx.db);
			const allowedEmails = new Set(recipients.map((r) => r.email));
			const ownEmail = user.email?.toLowerCase();
			const ccEmails = input.ccEmails.filter(
				(email) => allowedEmails.has(email) && email !== ownEmail,
			);

			const pageLines = input.screenshots.map(
				(screenshot, index) => `Screenshot ${index + 1}: ${screenshot.pageUrl}`,
			);

			try {
				await sendGmailAsUser(ctx.session, {
					to: ISSUE_REPORT_EMAIL,
					cc: ccEmails,
					subject: `[EMR Issue] ${input.subject}`,
					text: [
						...pageLines,
						...(pageLines.length > 0 ? [""] : []),
						input.body,
					].join("\n"),
					attachments: input.screenshots.map((screenshot, index) => ({
						filename: `screenshot-${index + 1}.png`,
						contentType: "image/png",
						base64: screenshot.base64,
					})),
				});
			} catch (error) {
				ctx.logger.error(error, "Failed to send issue report");
				if (error instanceof GmailScopeError) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message:
							"Sign out and sign back in, then allow sending email when Google asks.",
					});
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to send the report",
				});
			}
			return { success: true };
		}),
});

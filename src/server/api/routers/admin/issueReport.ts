import { TRPCError } from "@trpc/server";
import { desc, eq, or, sql } from "drizzle-orm";
import { hasPermission } from "~/lib/utils";
import {
	issueReportRecipientsSchema,
	issueReportSubmissionSchema,
} from "~/lib/validations/config";
import { diffValues, setAuditDetail } from "~/server/api/audit";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import type { db } from "~/server/db";
import {
	issueReportScreenshots,
	issueReports,
	pythonConfig,
	users,
} from "~/server/db/schema";

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

	submit: protectedProcedure
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

			// The background worker creates the Jira ticket and sends the email.
			await ctx.db.transaction(async (tx) => {
				const [{ insertId }] = await tx.insert(issueReports).values({
					reporterUserId: user.id,
					type: input.type,
					subject: input.subject,
					body: input.body,
					priority: input.priority,
					pageUrl: input.pageUrl,
					userAgent: input.userAgent,
					ccEmails: ccEmails.map((email) => email.toLowerCase()),
				});
				if (input.screenshots.length > 0) {
					await tx.insert(issueReportScreenshots).values(
						input.screenshots.map((screenshot) => ({
							reportId: insertId,
							pageUrl: screenshot.pageUrl,
							base64: screenshot.base64,
						})),
					);
				}
			});
			return { success: true };
		}),

	// Reports the user submitted, plus ones they were CC'd on (read-only).
	listMine: protectedProcedure.query(async ({ ctx }) => {
		const { id, email } = ctx.session.user;
		// CC addresses are stored lowercased, so the match ignores case.
		const ccedOn = email
			? sql`JSON_CONTAINS(${issueReports.ccEmails}, JSON_QUOTE(${email.toLowerCase()}))`
			: sql`false`;
		const rows = await ctx.db
			.select({
				id: issueReports.id,
				type: issueReports.type,
				subject: issueReports.subject,
				jiraKey: issueReports.jiraKey,
				jiraStatus: issueReports.jiraStatus,
				createdAt: issueReports.createdAt,
				reporterId: issueReports.reporterUserId,
				reporterName: users.name,
			})
			.from(issueReports)
			.innerJoin(users, eq(users.id, issueReports.reporterUserId))
			.where(or(eq(issueReports.reporterUserId, id), ccedOn))
			.orderBy(desc(issueReports.createdAt));
		return rows.map(({ reporterId, ...row }) => ({
			...row,
			sharedWithYou: reporterId !== id,
		}));
	}),
});

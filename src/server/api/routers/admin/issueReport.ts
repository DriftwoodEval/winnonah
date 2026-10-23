import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { env } from "~/env";
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
			const { recipients } = await loadRecipients(ctx.db);
			const allowedEmails = new Set(recipients.map((r) => r.email));
			const ccEmails = input.ccEmails.filter((email) =>
				allowedEmails.has(email),
			);

			const response = await fetch(`${env.PY_API}/notifications/issue-report`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Cookie: ctx.headers.get("cookie") ?? "",
				},
				body: JSON.stringify({
					subject: input.subject,
					body: input.body,
					page_url: input.pageUrl,
					cc_emails: ccEmails,
					screenshot_base64: input.screenshotBase64,
				}),
			}).catch(() => {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Could not reach the email service",
				});
			});

			if (!response.ok) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to send the report",
				});
			}
			return { success: true };
		}),
});

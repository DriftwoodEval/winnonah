import { and, asc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { ISSUE_REPORT_EMAIL } from "~/lib/constants";
import { sendGmailAsUser } from "~/lib/integrations/gmail";
import {
	addJiraAttachments,
	createJiraIssue,
	getJiraStatus,
} from "~/lib/integrations/jira";
import { logger } from "~/lib/logger";
import { db } from "~/server/db";
import {
	accounts,
	issueReportScreenshots,
	issueReports,
	users,
} from "~/server/db/schema";

const log = logger.child({ module: "issue-report-worker" });

// After this many failed Jira attempts the email goes out without a ticket key.
const MAX_JIRA_ATTEMPTS = 5;
// Reports older than this are assumed settled and no longer polled for status.
const STATUS_SYNC_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

type IssueReport = typeof issueReports.$inferSelect;

async function loadScreenshots(reportId: number) {
	const rows = await db
		.select()
		.from(issueReportScreenshots)
		.where(eq(issueReportScreenshots.reportId, reportId))
		.orderBy(asc(issueReportScreenshots.id));
	return rows.map((row, index) => ({
		filename: `screenshot-${index + 1}.jpg`,
		contentType: "image/jpeg",
		base64: row.base64,
		pageUrl: row.pageUrl,
	}));
}

/** Creates the Jira ticket if needed. Returns false when it should be retried later. */
async function ensureJiraTicket(
	report: IssueReport,
	screenshots: Awaited<ReturnType<typeof loadScreenshots>>,
) {
	if (report.jiraKey || report.jiraAttempts >= MAX_JIRA_ATTEMPTS) return true;

	const reporter = await db.query.users.findFirst({
		where: eq(users.id, report.reporterUserId),
	});
	const pageLines = [
		report.pageUrl && `Page: ${report.pageUrl}`,
		report.userAgent && `Browser: ${report.userAgent}`,
	].filter(Boolean);
	try {
		const key = await createJiraIssue({
			type: report.type,
			summary: report.subject,
			description: [...pageLines, "", report.body].join("\n"),
			priority: report.priority,
			reporter:
				reporter && `${reporter.name ?? reporter.email} (${reporter.email})`,
		});
		// Saved before attachments so a retry never creates a second ticket.
		await db
			.update(issueReports)
			.set({ jiraKey: key })
			.where(eq(issueReports.id, report.id));
		report.jiraKey = key;
	} catch (error) {
		log.error(error, `Failed to create Jira ticket for report ${report.id}`);
		report.jiraAttempts += 1;
		await db
			.update(issueReports)
			.set({ jiraAttempts: report.jiraAttempts })
			.where(eq(issueReports.id, report.id));
		return report.jiraAttempts >= MAX_JIRA_ATTEMPTS;
	}

	try {
		await addJiraAttachments(report.jiraKey, screenshots);
	} catch (error) {
		// The screenshots are also attached to the email, so this is not retried.
		log.error(error, `Failed to attach screenshots to ${report.jiraKey}`);
	}
	return true;
}

async function sendReportEmail(
	report: IssueReport,
	screenshots: Awaited<ReturnType<typeof loadScreenshots>>,
) {
	const account = await db.query.accounts.findFirst({
		where: eq(accounts.userId, report.reporterUserId),
	});
	const subjectSuffix = report.jiraKey ? ` [${report.jiraKey}]` : "";
	const pageLines = screenshots.map(
		(screenshot, index) => `Screenshot ${index + 1}: ${screenshot.pageUrl}`,
	);
	await sendGmailAsUser(
		{
			accessToken: account?.access_token,
			refreshToken: account?.refresh_token,
		},
		{
			to: ISSUE_REPORT_EMAIL,
			cc: report.ccEmails,
			subject: `${report.subject}${subjectSuffix}`,
			text: [
				...(report.pageUrl ? [`Page: ${report.pageUrl}`] : []),
				...pageLines,
				"",
				report.body,
			].join("\n"),
			attachments: screenshots,
		},
	);
}

/** Creates the Jira ticket and sends the tech@ email for each new report. */
async function processNewReports() {
	const pending = await db
		.select()
		.from(issueReports)
		.where(isNull(issueReports.emailSentAt))
		.orderBy(asc(issueReports.id));

	for (const report of pending) {
		try {
			const screenshots = await loadScreenshots(report.id);
			if (!(await ensureJiraTicket(report, screenshots))) continue;
			await sendReportEmail(report, screenshots);
			await db
				.update(issueReports)
				.set({ emailSentAt: new Date() })
				.where(eq(issueReports.id, report.id));
		} catch (error) {
			// lazy: a reporter whose Google access is permanently broken is retried
			// every tick. Upgrade path: cap attempts and alert on the cap.
			log.error(error, `Failed to send email for report ${report.id}`);
		}
	}
}

/** Copies the current Jira status onto recent reports that have a ticket. */
async function syncStatuses() {
	const tracked = await db
		.select({
			id: issueReports.id,
			jiraKey: issueReports.jiraKey,
			jiraStatus: issueReports.jiraStatus,
		})
		.from(issueReports)
		.where(
			and(
				isNotNull(issueReports.jiraKey),
				gt(
					issueReports.createdAt,
					new Date(Date.now() - STATUS_SYNC_WINDOW_MS),
				),
			),
		);

	for (const report of tracked) {
		if (!report.jiraKey) continue;
		try {
			const status = await getJiraStatus(report.jiraKey);
			if (status !== report.jiraStatus) {
				await db
					.update(issueReports)
					.set({ jiraStatus: status })
					.where(eq(issueReports.id, report.id));
			}
		} catch (error) {
			log.error(error, `Failed to read Jira status for ${report.jiraKey}`);
		}
	}
}

const TICK_MS = 60 * 1000;
const STATUS_SYNC_EVERY_TICKS = 10;

export async function runIssueReportWorker() {
	for (let tick = 0; ; tick++) {
		try {
			await processNewReports();
			if (tick % STATUS_SYNC_EVERY_TICKS === 0) await syncStatuses();
		} catch (error) {
			log.error(error, "Issue report worker tick failed");
		}
		await new Promise((resolve) => setTimeout(resolve, TICK_MS));
	}
}

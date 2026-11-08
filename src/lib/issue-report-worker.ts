import { and, asc, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { ISSUE_REPORT_EMAIL } from "~/lib/constants";
import { sendGmailAsUser } from "~/lib/integrations/gmail";
import {
	addJiraAttachments,
	createJiraIssue,
	getJiraIssueUrl,
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

// Shown as the report's status once its Jira ticket has been deleted in Jira.
const JIRA_DELETED_STATUS = "Deleted";
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

// Checked in order: Edge and Opera also contain "Chrome", and Chrome also contains "Safari".
const BROWSER_PATTERNS = [
	{ name: "Edge", pattern: /Edg(?:e|A|iOS)?\/(\d+)/ },
	{ name: "Opera", pattern: /OPR\/(\d+)/ },
	{ name: "Firefox", pattern: /(?:Firefox|FxiOS)\/(\d+)/ },
	{ name: "Chrome", pattern: /(?:Chrome|CriOS)\/(\d+)/ },
	{ name: "Safari", pattern: /Version\/(\d+).*Safari/ },
];

/** Reduces a user agent string to e.g. "Chrome 155", or the raw string if unrecognized. */
function describeBrowser(userAgent: string) {
	for (const { name, pattern } of BROWSER_PATTERNS) {
		const version = pattern.exec(userAgent)?.[1];
		if (version) return `${name} ${version}`;
	}
	return userAgent;
}

/**
 * The text shared by the Jira description and the email: what the user wrote,
 * then diagnostics. `leadingLines` go right after the description.
 */
function buildReportText(
	report: IssueReport,
	screenshots: Awaited<ReturnType<typeof loadScreenshots>>,
	leadingLines: string[] = [],
) {
	return [
		report.body,
		"",
		...leadingLines,
		...(report.pageUrl ? [`Page: ${report.pageUrl}`] : []),
		...(report.userAgent
			? [`Browser: ${describeBrowser(report.userAgent)}`]
			: []),
		...screenshots.map(
			(screenshot, index) => `Screenshot ${index + 1}: ${screenshot.pageUrl}`,
		),
		...(report.recentErrors ? ["", "Recent errors:", report.recentErrors] : []),
	].join("\n");
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
	try {
		const key = await createJiraIssue({
			type: report.type,
			summary: report.subject,
			description: buildReportText(report, screenshots),
			priority: report.priority,
			// The Jira field is a label, which cannot contain spaces.
			reporter:
				reporter && (reporter.name?.trim().split(/\s+/)[0] || reporter.email),
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
	await sendGmailAsUser(
		{
			accessToken: account?.access_token,
			refreshToken: account?.refresh_token,
		},
		{
			to: ISSUE_REPORT_EMAIL,
			cc: report.ccEmails,
			subject: `${report.subject}${subjectSuffix}`,
			text: buildReportText(
				report,
				screenshots,
				report.jiraKey ? [`Jira: ${getJiraIssueUrl(report.jiraKey)}`] : [],
			),
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
		if (!report.jiraKey || report.jiraStatus === JIRA_DELETED_STATUS) continue;
		try {
			const status =
				(await getJiraStatus(report.jiraKey)) ?? JIRA_DELETED_STATUS;
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

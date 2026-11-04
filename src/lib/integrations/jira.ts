import { env } from "~/env";
import type { IssueReportPriority } from "~/lib/validations/config";

interface NewIssue {
	type: "bug" | "feature";
	summary: string;
	description: string;
	priority: IssueReportPriority;
	/** Who submitted the report, stored in REPORTER_FIELD. */
	reporter?: string;
}

interface Attachment {
	filename: string;
	contentType: string;
	base64: string;
}

const ISSUE_TYPE_NAMES = { bug: "Bug", feature: "Task" } as const;

// Single-line text custom field holding who submitted the report.
const REPORTER_FIELD = "customfield_10204";

async function jiraFetch(path: string, init: RequestInit = {}) {
	const credentials = Buffer.from(
		`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`,
	).toString("base64");
	const response = await fetch(`${env.JIRA_BASE_URL}/rest/api/3${path}`, {
		...init,
		headers: {
			Authorization: `Basic ${credentials}`,
			Accept: "application/json",
			...init.headers,
		},
	});
	if (!response.ok) {
		// Jira's error body names the offending field (bad issue type, priority, project).
		const detail = (await response.text().catch(() => "")).slice(0, 500);
		throw new Error(`Jira ${path} failed with ${response.status}: ${detail}`);
	}
	return response;
}

/** Jira Cloud's v3 API requires descriptions as Atlassian Document Format. */
function toDocument(text: string) {
	return {
		type: "doc",
		version: 1,
		content: text.split("\n").map((line) => ({
			type: "paragraph",
			content: line ? [{ type: "text", text: line }] : [],
		})),
	};
}

/** Creates an issue and returns its key (e.g. "WIN-123"). */
export async function createJiraIssue(issue: NewIssue) {
	const response = await jiraFetch("/issue", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			fields: {
				project: { key: env.JIRA_PROJECT_KEY },
				issuetype: { name: ISSUE_TYPE_NAMES[issue.type] },
				summary: issue.summary,
				description: toDocument(issue.description),
				priority: { name: issue.priority },
				[REPORTER_FIELD]: issue.reporter,
			},
		}),
	});
	const { key } = (await response.json()) as { key: string };
	return key;
}

export async function addJiraAttachments(
	key: string,
	attachments: Attachment[],
) {
	if (attachments.length === 0) return;
	const form = new FormData();
	for (const { filename, contentType, base64 } of attachments) {
		form.append(
			"file",
			new Blob([Buffer.from(base64, "base64")], { type: contentType }),
			filename,
		);
	}
	await jiraFetch(`/issue/${key}/attachments`, {
		method: "POST",
		headers: { "X-Atlassian-Token": "no-check" },
		body: form,
	});
}

export async function getJiraStatus(key: string) {
	const response = await jiraFetch(`/issue/${key}?fields=status`);
	const issue = (await response.json()) as {
		fields: { status: { name: string } };
	};
	return issue.fields.status.name;
}

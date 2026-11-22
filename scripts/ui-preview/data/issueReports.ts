import { FAKE_USERS } from "./availability";

const NOW = new Date("2026-11-22T15:00:00.000Z");
const DAY = 86_400_000;

const SUBJECTS: [string, "bug" | "feature"][] = [
	["Calendar shows the wrong week after saving", "bug"],
	["Add a way to export the punch list", "feature"],
	["Insurance badge missing on client page", "bug"],
	["Allow notes on faxes", "feature"],
	["Search skips clients with a hyphen in the name", "bug"],
	["Show evaluator colors in the day panel", "feature"],
];
const STATUSES = ["To Do", "In Progress", "Done", null];

const ME = FAKE_USERS[0];

const REPORTS = SUBJECTS.map(([subject, type], i) => {
	const user = FAKE_USERS[i % FAKE_USERS.length] as (typeof FAKE_USERS)[number];
	return {
		id: 50 - i,
		type,
		subject,
		jiraKey: i % 4 === 3 ? null : `DW-${210 - i * 7}`,
		jiraStatus: STATUSES[i % STATUSES.length] ?? null,
		createdAt: new Date(NOW.getTime() - (i * 4 + 1) * DAY),
		reporterId: user.id,
		reporterName: user.name,
		ccEmails: i % 3 === 0 ? ["office.manager@example.com"] : [],
	};
});

/** `issueReport.listAll`: every report, newest first. */
export const ISSUE_REPORTS_ALL = REPORTS;

/** `issueReport.listMine`: the current user's reports plus ones shared with them. */
export const ISSUE_REPORTS_MINE = REPORTS.slice(0, 4).map(
	({ reporterId, ccEmails: _cc, ...row }, i) => ({
		...row,
		reporterId,
		sharedWithYou: i % 2 === 1 && reporterId !== ME?.id,
	}),
);

/** `insurances.getUniqueNamesFromClients`: names found on client records. */
export const INSURANCE_CLIENT_NAMES = [
	"Aetna",
	"Blue Cross Blue Shield",
	"Cigna",
	"Humana",
	"Medicaid Managed Care Org A",
	"UnitedHealthcare",
];

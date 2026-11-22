import type { inferRouterOutputs } from "@trpc/server";
import { DEFAULT_CLIENT_CARD_FIELDS } from "~/lib/clients/client-card";
import { PERMISSION_GROUP_IDS } from "~/lib/types";
import type { AppRouter } from "~/server/api/root";
import {
	claimHistory,
	reviewByClientId,
	reviewHistory,
	USERS_WITH_REVIEW,
} from "./data/adminReview";
import { appointmentsByClientId } from "./data/appointments";
import { AUDIT_ACTION_NAMES, AUDIT_USERS, auditList } from "./data/auditLog";
import { getAvailability, getTeamAvailability } from "./data/availability";
import {
	ADDRESS_CANDIDATES,
	CLIENT_PDFS,
	OFFICE_DRIVE_TIMES,
	pushPreview,
	REFERRAL_HISTORY,
	reminderTimeline,
} from "./data/clientExtras";
import { FAKE_CLIENTS, isNotesOnlyClient } from "./data/clients";
import { dashboardData } from "./data/dashboard";
import { externalRecordsListAll, questionnairesListAll } from "./data/database";
import {
	calendarRange,
	dayAhead,
	evaluatorCheckins,
	greeterSchedule,
	recentMessages,
} from "./data/dayahead";
import {
	directory,
	directoryFacetCounts,
	getCardSummary,
	getOne,
	uniqueLanguages,
} from "./data/directory";
import { getAppointments as evaluatorDashboardAppointments } from "./data/evaluatorDashboard";
import { insurancePolicies } from "./data/insurancePolicies";
import {
	INSURANCE_CLIENT_NAMES,
	ISSUE_REPORTS_ALL,
	ISSUE_REPORTS_MINE,
} from "./data/issueReports";
import {
	adminReviewEnabled,
	districtErrors,
	duplicateDriveFolders,
	duplicateNames,
	duplicateQuestionnaireLinks,
	ISSUE_LISTS,
	mergeSuggestions,
	punchlistIssues,
} from "./data/issues";
import {
	faxList,
	faxPendingCount,
	LOGIN_PERMISSION_LIST,
	LOGINS,
	loginHistory,
} from "./data/logins";
import {
	appointmentNoteHistory,
	noteByClientId,
	noteHistory,
	recordByClientId,
	recordHistory,
	reportNoteHistory,
} from "./data/notes";
import {
	ELIGIBILITY_DEBUG,
	evaluatorsAll,
	evaluatorsEligibleForClient,
	FAKE_DISTRICTS,
	FAKE_EVALUATORS,
	insurancesAll,
	officesAll,
	ZIP_CODES,
} from "./data/practice";
import {
	inPersonAssessmentHistory,
	inPersonAssessments,
	questionnaireHistory,
	questionnaireList,
	reminderOverrides,
	reminderPreviewValues,
	sentQuestionnaires,
} from "./data/questionnaires";
import { reportsList } from "./data/reports";
import { LOG_APPS, listLines, listRuns } from "./data/runLogs";
import {
	schedulingFacetCounts,
	schedulingGet,
	schedulingGetArchived,
} from "./data/scheduling";
import {
	appointmentsInRange,
	availability,
	dayAppointments,
	officeCalendar,
	queueInfo,
} from "./data/schedulingHelper";
import {
	APPOINTMENT_SYNC,
	ASSESSMENT_TYPES,
	BABYNET_REPORTS,
	CSV_FILE_INFO,
	EI_CONTACTS,
	ISSUE_REPORT_RECIPIENTS,
	PENDING_INVITATIONS,
	POST_VISIT_ATTACHMENT,
	POST_VISIT_MESSAGE,
	PRACTICE_NAME,
	PY_CONFIG,
	QUESTIONNAIRE_REMINDER_SETTINGS,
	QUESTIONNAIRE_REMINDER_TEMPLATES,
	QUESTIONNAIRE_RULES,
	REMINDER_SETTINGS,
	REMINDER_TEMPLATES,
	RUN_SUMMARIES,
	reminderLogs,
	reminderReplyLogs,
	SCRIPT_RUN_INFO,
} from "./data/settings";
import {
	DURATION_DEFAULTS,
	listAppointments,
	summary,
} from "./data/workSummary";

const active = FAKE_CLIENTS.filter((c) => c.status);

/** Every permission and permission group, so no page shows an "unauthorized" screen. */
const allPermissions = Object.fromEntries(
	[
		...Object.keys(PERMISSION_GROUP_IDS),
		...Object.values(PERMISSION_GROUP_IDS),
	].map((id) => [id, true]),
);

/** The body of `/api/auth/session`, so every page believes a user is signed in. */
export const FAKE_SESSION = {
	user: {
		id: "preview-user",
		name: "Preview User",
		email: "preview@example.com",
		image: null,
		permissions: allPermissions,
		realPermissions: allPermissions,
		isEvaluator: true,
		hasEvaluatorDashboard: true,
	},
	expires: "2099-01-01T00:00:00.000Z",
};

/** Procedures that return a list, left empty so pages render their empty state. */
/** Procedures that return a list, left empty so pages render their empty state. */
const EMPTY_LISTS = [
	"tasks.getActive",
] as const satisfies readonly ProcedurePath[];

type Outputs = inferRouterOutputs<AppRouter>;

/** One `[path, output]` pair per procedure, e.g. `["clients.getMergeSuggestions", Suggestion[]]`. */
type Pair = {
	[N in keyof Outputs & string]: {
		[P in keyof Outputs[N] & string]: [`${N}.${P}`, Outputs[N][P]];
	}[keyof Outputs[N] & string];
}[keyof Outputs & string];

/** Every tRPC procedure path, e.g. "clients.getMergeSuggestions". */
export type ProcedurePath = Pair[0];

/**
 * A fixture is the procedure's real output type (so `tsc` fails when a router changes shape), or a
 * function of the raw JSON query input that returns it. Dates stay `Date`: results are serialized
 * with superjson.
 */
/** Stands in for the void output of a mutation the preview never checks. */
const NO_RESULT = null as never;

type Fixtures = {
	// biome-ignore lint/suspicious/noExplicitAny: the raw input is JSON, each fixture narrows it itself
	[E in Pair as E[0]]?: E[1] | ((input: any) => E[1]);
};

/**
 * Canned tRPC query results, keyed by procedure path. A procedure with no entry here fails with
 * NOT_FOUND and is logged by `shot.ts`: add it below.
 */
export const FIXTURES: Fixtures = {
	...(Object.fromEntries(EMPTY_LISTS.map((name) => [name, []])) as Fixtures),
	...Object.fromEntries(EMPTY_LISTS.map((name) => [name, []])),
	...ISSUE_LISTS,
	"clients.getMergeSuggestions": mergeSuggestions,
	"adminReview.getAllEnabled": adminReviewEnabled,
	"adminReview.getMyClaimedClients": adminReviewEnabled.filter(
		(r) => r.claimedUserName === "Preview User",
	),
	"users.getListFilters": {},
	"listDismissals.list": [],
	"clients.getDuplicateNames": duplicateNames,
	"clients.getAll": FAKE_CLIENTS,
	"appointments.getByClientId": appointmentsByClientId,
	"clients.getInsurancePolicies": insurancePolicies,
	"clients.getFailures": [],
	"clients.getDashboardSectionHistory": [],
	"clients.getMergeSuggestionsForClient": {
		suggestedRealClients: [],
		suggestedNotesOnlyClients: [],
	},
	"clients.getSuggestedRelatedByPhone": [],
	"adminReview.getByClientId": reviewByClientId,
	"adminReview.getClaimHistory": claimHistory,
	"appointments.getReminderTimeline": reminderTimeline,
	"clients.getOfficeDriveTimes": OFFICE_DRIVE_TIMES,
	"clients.getReferralHistory": REFERRAL_HISTORY,
	"ddsQueue.listClientPdfs": CLIENT_PDFS,
	"google.getPushPreview": pushPreview,
	"offices.lookupAddress": ADDRESS_CANDIDATES,
	"quo.getAutomatedMessageContext": [],
	"adminReview.getHistory": reviewHistory,
	"notes.getNoteByClientId": noteByClientId,
	"notes.getHistory": noteHistory,
	"evaluatorDashboard.getNoteHistory": appointmentNoteHistory,
	"reports.noteHistory": reportNoteHistory,
	"externalRecords.getHistory": recordHistory,
	"externalRecords.getExternalRecordByClientId": recordByClientId,
	"questionnaires.getApplicableRules": {
		ageInYears: 8,
		asdAdhd: null,
		rules: [],
	},
	"questionnaires.getSentQuestionnaires": sentQuestionnaires,
	"questionnaires.getQuestionnaireList": questionnaireList,
	"questionnaires.getQuestionnaireHistory": questionnaireHistory,
	"questionnaires.getReminderOverrides": reminderOverrides,
	"questionnaires.getReminderPreviewValues": reminderPreviewValues,
	"questionnaires.getLatestScreenshot": { url: null, viaMhsPortal: false },
	"questionnaires.getInPersonAssessmentHistory": inPersonAssessmentHistory,
	"questionnaires.getInPersonAssessments": inPersonAssessments,
	"questionnaires.getAllTypes": ASSESSMENT_TYPES,
	"questionnaires.getAllRules": QUESTIONNAIRE_RULES,
	"eiContacts.list": EI_CONTACTS,
	"users.getPendingInvitations": PENDING_INVITATIONS,
	"pyConfig.getSync": APPOINTMENT_SYNC,
	"pyConfig.get": PY_CONFIG,
	"pyConfig.getPracticeName": PRACTICE_NAME,
	"reminders.getSettings": REMINDER_SETTINGS,
	"reminders.getTemplates": REMINDER_TEMPLATES,
	"reminders.getLogs": () => reminderLogs(active),
	"reminders.getReplyLogs": () => reminderReplyLogs(active),
	"questionnaires.getReminderSettings": QUESTIONNAIRE_REMINDER_SETTINGS,
	"questionnaires.getReminderTemplates": QUESTIONNAIRE_REMINDER_TEMPLATES,
	"postVisitAttachment.getMessage": POST_VISIT_MESSAGE,
	"postVisitAttachment.get": POST_VISIT_ATTACHMENT,
	"issueReport.listAll": ISSUE_REPORTS_ALL,
	"issueReport.listMine": ISSUE_REPORTS_MINE,
	"insurances.getUniqueNamesFromClients": INSURANCE_CLIENT_NAMES,
	"issueReport.getRecipients": ISSUE_REPORT_RECIPIENTS,
	"tasks.getRunSummaries": RUN_SUMMARIES,
	"clients.getCsvFileInfo": CSV_FILE_INFO,
	"clients.getScriptRunInfo": SCRIPT_RUN_INFO,
	"babynetReport.list": BABYNET_REPORTS,
	"auditLog.list": auditList,
	"auditLog.getActionNames": AUDIT_ACTION_NAMES,
	"auditLog.getDistinctUsers": AUDIT_USERS,
	"runLogs.listApps": LOG_APPS,
	"runLogs.listRuns": listRuns,
	"runLogs.listLines": listLines,
	"google.getQsSent": null,
	"users.getPinnedList": null,
	"clients.autoUpdateBabyNet": { count: 0 },
	"users.trackClientView": NO_RESULT,
	"users.getSavedPlaces": {},
	"sessions.getSchedulingFilters": { schedulingFilters: null },
	"scheduling.facetCounts": schedulingFacetCounts,
	"appointments.getPostVisitMessageList": [],
	"clients.syncPunchData": { synced: true },
	"google.getDashboardData": dashboardData,
	"questionnaires.listAll": questionnairesListAll,
	"externalRecords.listAll": externalRecordsListAll,
	"users.getDatabaseViews": {},
	"users.setDatabaseView": NO_RESULT,
	"google.getClientFromPunch": null,
	"scheduling.get": schedulingGet,
	"scheduling.getArchived": schedulingGetArchived,
	"quo.getContactTimeline": [],
	"evaluators.getAll": evaluatorsAll,
	"evaluators.getAllZipCodes": ZIP_CODES,
	"evaluators.getEligibilityDebug": ELIGIBILITY_DEBUG,
	"evaluators.getEligibleForClient": evaluatorsEligibleForClient,
	"insurances.getAll": insurancesAll,
	"offices.getAll": officesAll,
	"clients.directory": directory,
	"clients.getOne": getOne,
	"clients.getCardSummary": getCardSummary,
	"clients.directoryFacetCounts": directoryFacetCounts,
	"clients.getUniqueLanguages": uniqueLanguages,
	"sessions.getClientFilters": { clientFilters: null },
	"sessions.getDirectoryFilters": { directoryFilters: null },
	"google.getPunch": [],
	"users.getClientCardFields": DEFAULT_CLIENT_CARD_FIELDS,
	"clients.search": clientsSearch,
	"users.getIssueListOrder": null,
	"clients.getNotesOnlyClients": active.filter(isNotesOnlyClient),
	"clients.getAutismStops": active.filter((c) => c.autismStop),
	"clients.getPaused": FAKE_CLIENTS.filter((c) => c.pause),
	"clients.getEvaluationInProcess": active.filter((c) => c.evaluationInProcess),
	"google.findDuplicates": duplicateDriveFolders,
	"questionnaires.getDuplicateLinks": duplicateQuestionnaireLinks,
	"google.verifyPunchClients": punchlistIssues,
	"clients.getDistrictErrors": districtErrors,
	"logins.hasAccess": true,
	"evaluatorDashboard.getConfig": {
		dueDateWeeks: 4,
		showMarkComplete: true,
		evaluatorFirstName: FAKE_EVALUATORS[0]?.providerName.split(" ")[0] ?? null,
	},
	"evaluatorDashboard.getAppointments": evaluatorDashboardAppointments,
	"users.getHeaderPreferences": { desktop: [], mobile: [] },
	"users.getHomeWidgets": null,
	"users.getRecentClients": [],
	"users.getAll": USERS_WITH_REVIEW,
	"workSummary.getSummary": summary,
	"workSummary.getDefaults": DURATION_DEFAULTS,
	"logins.list": LOGINS,
	"logins.permissionList": LOGIN_PERMISSION_LIST,
	"logins.history": loginHistory,
	"faxCategorization.list": faxList,
	"faxCategorization.getPendingCount": faxPendingCount,
	"pyConfig.getPearsonVerificationEmail": {
		id: "msg-1",
		thread_id: null,
		subject: "Your Pearson verification code",
		from: "noreply@example.com",
		to: "front.desk@example.com",
		date: "2026-11-20",
		snippet: "Your code is 482913",
		body_text: "Your code is 482913",
		body_html: null,
	},
	"issues.getTotal": 7,
	"schedulingHelper.getDurationDefaults": DURATION_DEFAULTS,
	"schedulingHelper.getSchedulingQueueInfo": queueInfo,
	"schedulingHelper.getAvailability": availability,
	"schedulingHelper.getEvaluatorAppointmentsInRange": appointmentsInRange,
	"schedulingHelper.getEvaluatorDayAppointments": dayAppointments,
	"schedulingHelper.getOfficeCalendar": officeCalendar,
	"workSummary.listAppointments": listAppointments,
	"google.getAvailability": getAvailability,
	"google.getTeamAvailability": getTeamAvailability,
	"evaluators.getColors": FAKE_EVALUATORS.map((e) => ({
		npi: e.npi,
		providerName: e.providerName,
		email: e.email,
		color: e.color,
	})),
	"evaluators.getOutOfOfficePriority": false,
	"evaluators.getArchived": [],
	"evaluators.getAllSchoolDistricts": FAKE_DISTRICTS,
	"reports.list": reportsList,
	"reportQueue.getConfig": {
		defaultMaxClaimedReports: 2,
		firstReviewLabel: "First review",
		secondReviewLabel: "Second review",
	},
	"sessions.getReportsFilters": { reportsFilters: null },
	"reports.clientDrivePath": null,
	"google.getFolders": [
		{ id: "folder-a", name: "Reyes, Ana [100003]" },
		{ id: "folder-b", name: "Whitfield, Cole [100004]" },
		{ id: "folder-c", name: "Okafor, Ngozi [100005]" },
	],
	"google.getQueueCount": 3,
	"google.getClaimedFolders": {
		folders: [{ id: "folder-d", name: "Lindqvist, Maren [100006]" }],
		effectiveMax: 2,
	},
	"google.getClaimedReports": [],
	"google.getWriterFolder": { id: "writer-folder", name: "Writer folder" },
	"appointments.getDayAhead": dayAhead,
	"appointments.getCalendarRange": calendarRange,
	"appointments.getEvaluatorCheckins": evaluatorCheckins,
	"quo.getRecentMessages": recentMessages,
	"quo.getQuoUsers": [
		{ id: "quo-user-1", name: "Preview User", phone: "864-555-0100" },
		{ id: "quo-user-2", name: "Taylor Brooks", phone: "864-555-0142" },
	],
	"greeterProxy.getSchedule": greeterSchedule,
	"roles.getAll": [
		{
			id: 1,
			name: "Admin",
			permissions: allPermissions,
			isDefault: false,
			createdAt: new Date("2026-01-01T12:00:00.000Z"),
			updatedAt: null,
		},
		{
			id: 2,
			name: "Front Desk",
			permissions: {},
			isDefault: true,
			createdAt: new Date("2026-01-01T12:00:00.000Z"),
			updatedAt: null,
		},
	],
};

type SearchInput = {
	nameSearch?: string;
	status?: "active" | "inactive" | "all";
	type?: "both" | "real" | "note";
	color?: string;
	privatePay?: boolean;
	autismStop?: boolean;
	hideBabyNet?: boolean;
	excludeIds?: number[];
};

/** Mirrors `clients.search`: filtered rows plus per-color counts taken before the color filter. */
function clientsSearch(raw: unknown) {
	const input = (raw ?? {}) as SearchInput;
	const words = (input.nameSearch ?? "")
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean);
	const status = input.status ?? "active";
	const type = input.type ?? "both";
	const beforeColor = FAKE_CLIENTS.filter(
		(c) =>
			(status === "all" || c.status === (status === "active")) &&
			(type === "both" || isNotesOnlyClient(c) === (type === "note")) &&
			(!input.privatePay || c.privatePay) &&
			(!input.autismStop || c.autismStop) &&
			(!input.hideBabyNet || !c.babyNet) &&
			!input.excludeIds?.includes(c.id) &&
			words.every((w) => c.fullName.toLowerCase().includes(w)),
	);
	const counts = new Map<(typeof FAKE_CLIENTS)[number]["color"], number>();
	for (const c of beforeColor)
		counts.set(c.color, (counts.get(c.color) ?? 0) + 1);
	return {
		clients: beforeColor
			.filter((c) => !input.color || c.color === input.color)
			.map((c) => ({ ...c, sortReason: "", distanceToOffice: null })),
		colorCounts: [...counts].map(([color, count]) => ({ color, count })),
	};
}

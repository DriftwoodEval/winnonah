import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "~/server/api/root";
import type {
	assessmentTypes,
	babynetReports,
	eiContacts,
	invitations,
	questionnaireReminderTemplates,
	questionnaireRules,
	reminderTemplates,
} from "~/server/db/schema";
import { FAKE_EVALUATORS } from "./practice";

type AssessmentType = typeof assessmentTypes.$inferSelect;
type Rule = typeof questionnaireRules.$inferSelect;
type Invitation = typeof invitations.$inferSelect;
type EiContact = typeof eiContacts.$inferSelect;

/** `questionnaires.getAllTypes`: online questionnaires plus in-person assessments, sorted by name. */
export const ASSESSMENT_TYPES: AssessmentType[] = (
	[
		["ASQ", "Q-Global", 0, 5, 20, false],
		["BASC", "Q-Global", 6, 18, 30, false],
		["CBCL", "ASEBA", 1, 18, 20, false],
		["Conners", "MHS", 6, 18, 25, false],
		["SCQ", "WPS", 4, 18, 10, false],
		["SRS", "WPS", 4, 18, 15, false],
		["Vineland", "Q-Global", 0, 18, 45, false],
		["ADOS-2", "In office", 1, 18, 60, true],
		["WISC-V", "In office", 6, 16, 90, true],
		["Mullen", "In office", 0, 5, 45, true],
	] as const
)
	.map(([name, site, minAge, maxAge, minutes, inPerson], i) => ({
		id: i + 1,
		name,
		site,
		minAge,
		maxAge,
		minutes,
		inPerson,
	}))
	.sort((a, b) => a.name.localeCompare(b.name));

/** `questionnaires.getAllRules`: every DA/Eval/DA+Eval and diagnosis combination, with and without in-person tests. */
export const QUESTIONNAIRE_RULES: Rule[] = (
	[
		["DA", "ASD", 0, 5, ["ASQ", "SCQ"], ["Mullen"]],
		["DA", "ASD", 6, 18, ["SRS", "SCQ", "Vineland"], null],
		["DA", "ADHD", 6, 18, ["BASC", "Conners"], null],
		["DA", null, 0, 18, ["CBCL"], null],
		["EVAL", "ASD", 0, 5, ["Vineland"], ["ADOS-2", "Mullen"]],
		["EVAL", "ASD", 6, 18, ["Vineland"], ["ADOS-2", "WISC-V"]],
		["EVAL", "LD", 6, 16, ["BASC"], ["WISC-V"]],
		["DAEVAL", "ASD", 6, 18, ["SRS", "Vineland"], ["ADOS-2"]],
		["DAEVAL", "ADHD", 6, 18, ["BASC", "Conners"], null],
		["DAEVAL", null, 0, 5, ["ASQ"], null],
	] as const
).map(([daeval, diagnosis, minAge, maxAge, qs, inPerson], i) => ({
	id: i + 1,
	daeval,
	diagnosis,
	minAge,
	maxAge,
	questionnaires: [...qs],
	inPersonAssessments: inPerson ? [...inPerson] : null,
}));

/** `eiContacts.list`: early intervention coordinators, sorted by name. */
export const EI_CONTACTS: EiContact[] = [
	["Amara Whitlock", "8645550111"],
	["Bryce Delgado", "8035550148"],
	["Corinne Abernathy", "8435550173"],
	["Dev Raman", "8645550190"],
].map(([name, phoneNumber], i) => ({
	id: i + 1,
	name: name as string,
	phoneNumber: phoneNumber as string,
}));

/** `users.getPendingInvitations`: one with a role, one with custom permissions, one with neither. */
export const PENDING_INVITATIONS: Invitation[] = [
	["new.evaluator@example.com", 2, null],
	["intern@example.com", null, { "clients:view": true }],
	["contractor@example.com", null, null],
].map(([email, roleId, permissions], i) => ({
	id: i + 1,
	email: email as string,
	savedPlaces: null,
	permissions: permissions as Invitation["permissions"],
	roleId: roleId as number | null,
	status: "pending",
	usedAt: null,
	createdAt: new Date(Date.parse("2026-11-20T15:00:00.000Z") - i * 86_400_000),
}));

const NOW = new Date("2026-11-22T15:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const epochSeconds = (hoursAgo: number) =>
	Math.floor((NOW.getTime() - hoursAgo * HOUR) / 1000);

/** `pyConfig.getSync`: appointment ids the sync always trusts or always skips. */
export const APPOINTMENT_SYNC = {
	trusted_appointment_ids: ["a1b2c3d4-0001", "a1b2c3d4-0002"],
	ignored_appointment_ids: ["e5f6a7b8-0101"],
};

/** `reminders.getSettings`. */
export const REMINDER_SETTINGS = {
	id: 1,
	quietWindowStart: "18:00:00",
	quietWindowEnd: "08:00:00",
};

type ReminderTemplate = typeof reminderTemplates.$inferSelect;

const baseTemplate = {
	triggerKeyword: null,
	triggerDaEval: null,
	triggerLocationKey: null,
	minAgeYears: null,
	maxAgeYears: null,
	confirmationReply: null,
	isActive: true,
	isNoReplyFollowUp: false,
	isConfirmedFollowUp: false,
	isEiReminder: false,
} satisfies Partial<ReminderTemplate>;

/** `reminders.getTemplates`, sorted by name. */
export const REMINDER_TEMPLATES: ReminderTemplate[] = [
	{
		...baseTemplate,
		id: 1,
		name: "Confirmed follow-up",
		messageTemplate:
			"Thanks for confirming. We look forward to seeing {first_name} on {date}.",
		sendOffsetHours: 2,
		isConfirmedFollowUp: true,
	},
	{
		...baseTemplate,
		id: 2,
		name: "DA 48 hours",
		triggerDaEval: "DA",
		messageTemplate:
			"Hi, this is a reminder that {first_name} has an appointment on {date} at {time}. Reply C to confirm.",
		confirmationReply: "Thank you, your appointment is confirmed.",
		sendOffsetHours: 48,
	},
	{
		...baseTemplate,
		id: 3,
		name: "EI contact reminder",
		messageTemplate:
			"Reminder: {first_name} has an appointment on {date} at {time}.",
		sendOffsetHours: 48,
		isEiReminder: true,
	},
	{
		...baseTemplate,
		id: 4,
		name: "EVAL 48 hours",
		triggerDaEval: "EVAL",
		minAgeYears: 3,
		messageTemplate:
			"Hi, this is a reminder that {first_name} has an evaluation on {date} at {time}. Reply C to confirm.",
		confirmationReply: "Thank you, your appointment is confirmed.",
		sendOffsetHours: 48,
	},
	{
		...baseTemplate,
		id: 5,
		name: "No reply follow-up",
		messageTemplate:
			"We have not heard back about $CLIENT_FNAME's appointment on {date}. Please reply C to confirm.",
		sendOffsetHours: 24,
		isNoReplyFollowUp: true,
	},
	{
		...baseTemplate,
		id: 6,
		name: "Old reminder (paused)",
		triggerKeyword: "Spartanburg",
		triggerLocationKey: ["spartanburg"],
		messageTemplate: "Reminder for {first_name} on {date}.",
		sendOffsetHours: 72,
		isActive: false,
	},
];

/** Fields the reminder logs read from a client. */
type LogClient = {
	id: number;
	firstName: string;
	lastName: string;
	hash: string;
};

/** `reminders.getLogs`: one sent reminder per client, newest first. */
export function reminderLogs(clientRows: LogClient[]) {
	return clientRows.slice(0, 8).map((c, i) => ({
		id: 100 - i,
		sentAt: new Date(NOW.getTime() - (i * 5 + 1) * HOUR),
		clientFirstName: c.firstName,
		clientLastName: c.lastName,
		clientHash: c.hash,
		clientId: c.id,
		appointmentStart: new Date(NOW.getTime() + (2 - (i % 3)) * DAY),
		templateName: REMINDER_TEMPLATES[1 + (i % 4)]?.name ?? "DA 48 hours",
	}));
}

/** `reminders.getReplyLogs`: client replies, a mix of confirmations and other texts. */
export function reminderReplyLogs(clientRows: LogClient[]) {
	const texts = [
		"C",
		"Confirmed",
		"Can we move to later?",
		"c",
		"Sorry, we are sick",
	];
	return clientRows.slice(0, 5).map((c, i) => {
		const isConfirmation = i % 5 !== 2 && i % 5 !== 4;
		return {
			id: 50 - i,
			receivedAt: new Date(NOW.getTime() - (i * 7 + 2) * HOUR),
			clientFirstName: c.firstName,
			clientLastName: c.lastName,
			clientHash: c.hash,
			clientId: c.id,
			appointmentStart: new Date(NOW.getTime() + (1 + (i % 3)) * DAY),
			incomingText: texts[i] ?? "C",
			isConfirmation,
			confirmationReplyText: isConfirmation
				? "Thank you, your appointment is confirmed."
				: null,
		};
	});
}

/** `questionnaires.getReminderSettings`. */
export const QUESTIONNAIRE_REMINDER_SETTINGS = {
	id: 1,
	stage2OffsetDays: 14,
	stage3OffsetDays: 7,
	escalationSilenceDays: 3,
};

type QReminderTemplate = typeof questionnaireReminderTemplates.$inferSelect;

/** `questionnaires.getReminderTemplates`: three stages, each with default and post-visit variants. */
export const QUESTIONNAIRE_REMINDER_TEMPLATES: QReminderTemplate[] = [0, 1, 2]
	.flatMap((stage) =>
		(["DEFAULT", "POSTDA", "POSTEVAL"] as const).map((variant) => ({
			stage,
			variant,
		})),
	)
	.map(({ stage, variant }, i) => ({
		id: i + 1,
		reminderIndex: stage,
		variant,
		message:
			variant === "DEFAULT"
				? `Reminder ${stage + 1}: please finish $CLIENT_FNAME's questionnaires before the appointment.`
				: `Reminder ${stage + 1}: we still need $CLIENT_FNAME's questionnaires after the ${variant === "POSTDA" ? "DA" : "evaluation"}.`,
		updatedAt: new Date(NOW.getTime() - (i + 3) * DAY),
		updatedBy: "preview@example.com",
	}));

/** `postVisitAttachment.getMessage`. */
export const POST_VISIT_MESSAGE = {
	subject: "Thank you for visiting us",
	body: "Thank you for bringing {first_name} in. The attached sheet lists next steps and who to call with questions.",
};

/** `postVisitAttachment.get`: the sidecar reports when the stored PDF was last updated, in epoch seconds. */
export const POST_VISIT_ATTACHMENT = {
	updatedAt: Math.floor((NOW.getTime() - 12 * DAY) / 1000),
};

/** `issueReport.getRecipients`. */
export const ISSUE_REPORT_RECIPIENTS = {
	recipients: [
		{ name: "Dana Okoye", email: "front.desk@example.com" },
		{ name: "Priya Nair", email: "billing@example.com" },
		{ name: "Tech Support", email: "tech@example.com" },
	],
};

type RunSummaryRow =
	inferRouterOutputs<AppRouter>["tasks"]["getRunSummaries"][number];

/** `tasks.getRunSummaries`: the latest run of each summarized task type. */
export const RUN_SUMMARIES: RunSummaryRow[] = [
	{
		type: "import_from_ta",
		task: {
			id: 1,
			type: "import_from_ta",
			status: "completed",
			label: "Import from TherapyAppointment",
			detail: null,
			progressCurrent: null,
			progressTotal: null,
			error: null,
			summary: {
				new_clients: 4,
				address_changes: 2,
				insurance_changes: 3,
				deactivated: 1,
				reactivated: 0,
			},
			startedAt: new Date(NOW.getTime() - 3 * HOUR),
			completedAt: new Date(NOW.getTime() - 3 * HOUR + 4 * 60_000),
		},
	},
	{
		type: "questionnaire_send",
		task: {
			id: 2,
			type: "questionnaire_send",
			status: "completed",
			label: "Send questionnaires",
			detail: null,
			progressCurrent: null,
			progressTotal: null,
			error: null,
			summary: { sent: 7, failed: 1 },
			startedAt: new Date(NOW.getTime() - 5 * HOUR),
			completedAt: new Date(NOW.getTime() - 5 * HOUR + 2 * 60_000),
		},
	},
	{
		type: "records_request",
		task: {
			id: 3,
			type: "records_request",
			status: "failed",
			label: "Request records",
			detail: null,
			progressCurrent: null,
			progressTotal: null,
			error: "Fax service timed out",
			summary: { requested: 2, failed: 2 },
			startedAt: new Date(NOW.getTime() - DAY),
			completedAt: new Date(NOW.getTime() - DAY + 60_000),
		},
	},
	{ type: "evaluator_rematch", task: null },
	{
		type: "appointment_sync",
		task: {
			id: 5,
			type: "appointment_sync",
			status: "completed",
			label: "Sync appointments",
			detail: null,
			progressCurrent: null,
			progressTotal: null,
			error: null,
			summary: {
				appointments_synced: 86,
				real_synced: 61,
				billing_only_synced: 18,
				cancelled_synced: 5,
				moved_synced: 2,
			},
			startedAt: new Date(NOW.getTime() - HOUR),
			completedAt: new Date(NOW.getTime() - HOUR + 3 * 60_000),
		},
	},
];

/** `clients.getCsvFileInfo`: last-modified time (epoch seconds) of each CSV export. */
export const CSV_FILE_INFO: Record<string, number | null> = {
	billing: epochSeconds(6),
	appointments: epochSeconds(6),
	demographic: epochSeconds(30),
	insurance: epochSeconds(30),
	chart: null,
	referral: epochSeconds(54),
	quo: epochSeconds(2),
};

/** `clients.getScriptRunInfo`: last run time (epoch seconds) of each scheduled script. */
export const SCRIPT_RUN_INFO: Record<string, number | null> = {
	appointment_reminders: epochSeconds(1),
	qsend: epochSeconds(5),
	records_request: epochSeconds(24),
	piecework: null,
	qreceive: epochSeconds(2),
};

type BabynetReport = typeof babynetReports.$inferSelect;

/** `babynetReport.list`: one row per week, newest first. */
export const BABYNET_REPORTS: BabynetReport[] = [0, 1, 2, 3, 4, 5].map((i) => {
	const clientCount = 9 + ((i * 5) % 7);
	const weekOf = new Date(Date.UTC(2026, 10, 16) - i * 7 * DAY)
		.toISOString()
		.slice(0, 10);
	return {
		id: 6 - i,
		weekOf,
		clientCount,
		amount: (clientCount * 187.5).toFixed(2),
		createdAt: new Date(`${weekOf}T13:00:00.000Z`),
	};
});

/** `pyConfig.get` (and `getPracticeName`): placeholder credentials and practice settings. */
/** The sender first name: it must match the first word of a Quo user key below. */
export const PRACTICE_NAME = "Preview";

const service = { username: "preview-user", password: "preview-password" };

const PIECEWORK_EVALUATORS = FAKE_EVALUATORS.filter((e) => !e.archived).slice(
	0,
	2,
);

/** Staff are keyed by initials, e.g. "Jane Doe" becomes "JD". */
const initialsOf = (name: string) =>
	name
		.split(" ")
		.map((w) => w[0])
		.join("");

export const PY_CONFIG = {
	services: {
		openphone: {
			key: "preview-key",
			main_number: "+18645550100",
			users: {
				"Preview User": { id: "quo-user-1" },
				"Taylor Brooks": { id: "quo-user-2" },
			},
		},
		therapyappointment: {
			...service,
			admin_username: "admin-user",
			admin_password: "admin-password",
		},
		medicaid: service,
		mhs: service,
		qglobal: service,
		wps: service,
		novopsych: service,
	},
	config: {
		initials: "DEC",
		name: PRACTICE_NAME,
		referral_sender_name: "Taylor",
		private_pay_sender_name: "Preview",
		email: "office@example.com",
		automated_email: "automated@example.com",
		qreceive_emails: ["qreceive@example.com"],
		tech_email: "tech@example.com",
		punch_list_id: "preview-sheet-id",
		punch_list_range: "Punchlist!A1:Z",
		failed_sheet_id: "preview-failed-sheet-id",
		payroll_folder_id: "preview-payroll-folder",
		database_url: "mysql://preview:preview@localhost/preview",
		business_timezone: "America/New_York",
		excluded_ta: ["Test Client"],
		records_folder_id: "preview-records-folder",
		sent_records_folder_id: "preview-sent-records-folder",
		records_emails: {
			"Upstate Pediatrics": {
				email: "records@upstate.example.com",
				fax: false,
				aliases: ["Upstate Peds"],
			},
			"Valley School District": {
				email: "records@valley.example.com",
				fax: true,
				aliases: [],
			},
		},
		piecework: {
			costs: Object.fromEntries([
				[
					"default",
					{ DA: 150, ADHDDA: 100, EVAL: 300, DAEVAL: 400, REPORT: 200 },
				],
				...PIECEWORK_EVALUATORS.map((e, i) => [
					e.providerName,
					{
						DA: 160 + i * 10,
						ADHDDA: 110,
						EVAL: 320,
						DAEVAL: 420,
						REPORT: 210,
					},
				]),
			]),
			name_map: Object.fromEntries(
				PIECEWORK_EVALUATORS.map((e) => [
					initialsOf(e.providerName),
					e.providerName,
				]),
			),
			payroll_emails: Object.fromEntries(
				PIECEWORK_EVALUATORS.map((e) => [e.providerName, e.email]),
			),
			adhd_piecework_evaluator_npi: String(PIECEWORK_EVALUATORS[0]?.npi ?? ""),
		},
	},
};

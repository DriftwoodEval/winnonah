import type { questionnaireReminderOverrides } from "~/server/db/schema";
import { FAKE_CLIENTS, isNotesOnlyClient } from "./clients";
import { ASSESSMENT_TYPES } from "./settings";

const NOW = new Date("2026-11-22T15:00:00.000Z");
const DAY = 86_400_000;

type Override = typeof questionnaireReminderOverrides.$inferSelect;

const daysAgo = (n: number) =>
	new Date(NOW.getTime() - n * DAY).toISOString().slice(0, 10);

const daysAgoDate = (n: number) => new Date(NOW.getTime() - n * DAY);

const ONLINE_TYPES = ASSESSMENT_TYPES.filter((t) => !t.inPerson);
const IN_PERSON_TYPES = ASSESSMENT_TYPES.filter((t) => t.inPerson);

const STATUSES = [
	"PENDING",
	"COMPLETED",
	"POSTDA_PENDING",
	"POSTEVAL_PENDING",
	"IGNORING",
	"RESPONDED",
	"SPANISH",
	"EXTERNAL",
] as const;

const hasQuestionnaires = (clientId: number) =>
	FAKE_CLIENTS.some((c) => c.id === clientId && !isNotesOnlyClient(c));

/** `questionnaires.getSentQuestionnaires`: 3 to 5 rows per client, two batches, mixed statuses. */
export const sentQuestionnaires = (clientId: unknown) => {
	const id = clientId as number;
	if (!hasQuestionnaires(id)) return [];
	const count = 3 + (id % 3);
	return Array.from({ length: count }, (_, i) => {
		const type = ONLINE_TYPES[(id + i) % ONLINE_TYPES.length];
		const status = STATUSES[(id + i * 3) % STATUSES.length] ?? null;
		const sentDaysAgo = i < 2 ? 20 : 45;
		const reminded = status === "PENDING" ? i % 3 : 0;
		return {
			id: id * 10 + i,
			clientId: id,
			questionnaireType: type?.name ?? "ASQ",
			link: `https://example.com/q/${id}-${i}`,
			sent: daysAgo(sentDaysAgo),
			status,
			reminded,
			lastReminded: reminded ? daysAgo(sentDaysAgo - 7) : null,
			pdfFileId: status === "COMPLETED" ? `pdf-${id}-${i}` : null,
			pdfCheckedAt: status === "COMPLETED" ? daysAgoDate(1) : null,
			responseText: status === "RESPONDED" ? "Please call me back" : null,
			updatedAt: new Date(NOW.getTime() - 2 * DAY),
		};
	});
};

/** `questionnaires.getQuestionnaireList`: the online types a client's age allows (all of them here). */
export const questionnaireList = () => ONLINE_TYPES;

/** `questionnaires.getQuestionnaireHistory`: newest first. */
export const questionnaireHistory = (clientId: unknown) => {
	const id = clientId as number;
	if (!hasQuestionnaires(id)) return [];
	const type = (n: number) =>
		ONLINE_TYPES[(id + n) % ONLINE_TYPES.length]?.name ?? "ASQ";
	return [
		{
			id: id * 100 + 1,
			createdAt: new Date(NOW.getTime() - 1 * DAY),
			actor: "Automatic",
			description: `Updated ${type(0)}: status PENDING to COMPLETED`,
		},
		{
			id: id * 100 + 2,
			createdAt: new Date(NOW.getTime() - 6 * DAY),
			actor: "Preview User",
			description: `Added ${type(1)} (sent ${daysAgo(20)})`,
		},
		{
			id: id * 100 + 3,
			createdAt: new Date(NOW.getTime() - 20 * DAY),
			actor: "Taylor Brooks",
			description: `Added ${type(0)} (sent ${daysAgo(45)})`,
		},
	];
};

/** `questionnaires.getReminderOverrides`: one custom message for every fifth client. */
export const reminderOverrides = (clientId: unknown): Override[] => {
	const id = clientId as number;
	if (!hasQuestionnaires(id) || id % 5 !== 0) return [];
	return [
		{
			clientId: id,
			sent: daysAgo(20),
			reminderIndex: 1,
			message: "Hi $CLIENT_FNAME, a quick nudge about the forms. $PORTAL_LINK",
			createdAt: new Date(NOW.getTime() - 3 * DAY),
			updatedAt: new Date(NOW.getTime() - 3 * DAY),
			updatedBy: "preview@example.com",
		},
	];
};

/** `questionnaires.getReminderPreviewValues`: the placeholder values for one batch. */
export const reminderPreviewValues = (raw: unknown) => {
	const { clientId } = raw as { clientId: number; sent: string };
	const client = FAKE_CLIENTS.find((c) => c.id === clientId);
	return {
		variant: "DEFAULT" as const,
		remindedCount: 1,
		values: {
			$CLIENT_FNAME: client?.firstName ?? "",
			$STAFF_NAME: "Front Desk",
			$QUESTIONNAIRE_WORD: "questionnaire",
			$IT_THEM: "it",
			$IT_THEY: "it",
			$IS_ARE: "is",
			$ITS_THEIR: "its",
			$DISTANCE_PHRASE: "about three weeks ago",
			$DEADLINE_DATE: "Thursday, November 26",
			$ESCALATION_DAYS: "3",
			$PORTAL_LINK: "https://example.com/portal",
			$COMPLETED_COUNT: "1",
			$REMAINING_COUNT: "2",
		},
	};
};

/** `questionnaires.getInPersonAssessments`: every other client has one or two. */
export const inPersonAssessments = (clientId: unknown) => {
	const id = clientId as number;
	if (!hasQuestionnaires(id) || id % 2 !== 0) return [];
	return IN_PERSON_TYPES.slice(0, 1 + (id % 2 === 0 ? id % 3 : 0)).map(
		(t, i) => ({
			id: id * 10 + i,
			clientId: id,
			assessmentType: t.name,
			status: i === 1 ? ("EXTERNAL" as const) : null,
			addedDate: daysAgo(10),
			appointmentId: null,
			updatedAt: new Date(NOW.getTime() - DAY),
			appointmentStartTime: null,
			appointmentDaEval: null,
		}),
	);
};

/** `questionnaires.getInPersonAssessmentHistory`: one archived session for every fourth client. */
export const inPersonAssessmentHistory = (clientId: unknown) => {
	const id = clientId as number;
	if (!hasQuestionnaires(id) || id % 4 !== 0) return [];
	return [
		{
			id: id * 10,
			assessmentType: IN_PERSON_TYPES[0]?.name ?? "ADOS-2",
			content: { status: "EXTERNAL", appointmentId: null },
			createdAt: new Date(NOW.getTime() - 60 * DAY),
		},
	];
};

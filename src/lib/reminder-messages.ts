import { parseDateOnly } from "~/lib/utils";

export const REMINDER_PLACEHOLDERS = [
	["$CLIENT_FIRST_NAME", "client's first name"],
	["$STAFF_NAME", "sender's name"],
	["$QUESTIONNAIRE_WORD", '"questionnaire" or "questionnaires"'],
	["$IT_THEM", '"it" or "them"'],
	["$IT_THEY", '"it" or "they"'],
	["$IS_ARE", '"is" or "are"'],
	["$ITS_THEIR", '"its" or "their"'],
	["$DISTANCE_PHRASE", "e.g. today / on 3/14 (5 days ago)"],
	["$DEADLINE_DATE", "escalation deadline, e.g. 3/17"],
	["$ESCALATION_DAYS", "days until escalation, from Cadence settings"],
	["$PORTAL_LINK", "patient portal URL"],
	["$COMPLETED_COUNT", "number of questionnaires already completed"],
	["$REMAINING_COUNT", "number of questionnaires still pending"],
] as const;

export const REMINDER_PLACEHOLDER_TOKENS = REMINDER_PLACEHOLDERS.map(
	([token]) => token,
);

export const REMINDER_PORTAL_LINK = "https://portal.therapyappointment.com";

/**
 * Mirrors the $PLACEHOLDER substitution in the questionnaires repo's
 * utils/messages.py::render_reminder_message, for previewing message text
 * client-side without a round trip. Keep the placeholder set in sync with
 * that function if you add/remove one.
 */
export function substituteReminderPlaceholders(
	template: string,
	values: Record<string, string>,
): string {
	let message = template;
	for (const [placeholder, value] of Object.entries(values)) {
		message = message.replaceAll(placeholder, value);
	}
	return message;
}

export function reminderPluralization(count: number) {
	const single = count === 1;
	return {
		$QUESTIONNAIRE_WORD: single ? "questionnaire" : "questionnaires",
		$IT_THEM: single ? "it" : "them",
		$IT_THEY: single ? "it" : "they",
		$IS_ARE: single ? "is" : "are",
		$ITS_THEIR: single ? "its" : "their",
	};
}

/**
 * $DISTANCE_PHRASE: how long ago a batch was sent, relative to the
 * practice's business-local "today". Both dates are plain "YYYY-MM-DD"
 * strings (business-local), never `Date` objects, so this parses them as
 * calendar dates with no timezone conversion.
 */
export function reminderDistancePhrase(
	sent: string,
	todayBusiness: string,
): string {
	const sentParts = parseDateOnly(sent);
	const todayParts = parseDateOnly(todayBusiness);
	const sentUtc = sentParts
		? Date.UTC(sentParts.year, sentParts.month - 1, sentParts.day)
		: null;
	const todayUtc = todayParts
		? Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day)
		: null;
	const distance =
		sentUtc !== null && todayUtc !== null
			? Math.round((todayUtc - sentUtc) / 86_400_000)
			: 0;
	const mmdd = sentParts ? `${sentParts.month}/${sentParts.day}` : sent;
	if (distance === 0) return "today";
	if (distance === 1) return `on ${mmdd} (yesterday)`;
	return `on ${mmdd} (${Math.abs(distance)} days ago)`;
}

/**
 * $DEADLINE_DATE: the escalation deadline, `escalationDays` after the
 * practice's business-local "today", formatted M/D.
 */
export function reminderDeadlineDate(
	todayBusiness: string,
	escalationDays: number,
): string {
	const todayParts = parseDateOnly(todayBusiness);
	if (!todayParts) return "";
	const deadlineUtc =
		Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day) +
		escalationDays * 86_400_000;
	const deadline = new Date(deadlineUtc);
	return `${deadline.getUTCMonth() + 1}/${deadline.getUTCDate()}`;
}

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

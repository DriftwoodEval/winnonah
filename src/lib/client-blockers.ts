import { compareDateOnly, formatShortDate } from "~/lib/utils";

export type RecordsReadinessInput = {
	recordsNeeded: "Needed" | "Not Needed" | null;
	asdAdhd: string | null;
	hasExternalRecordContent: boolean;
	requestedDates: (string | null | undefined)[];
};

/**
 * Mirrors get_record_ready_client_ids() in questionnaires/utils/database.py:
 * records-request.py stops picking a client up once external records exist,
 * an ADHD-only client is exempt, or recordsNeeded is "Not Needed". Otherwise
 * this returns why records aren't ready yet, matching that function's wording.
 */
export function getRecordsNotReadyReason(
	input: RecordsReadinessInput,
): string | null {
	if (
		input.recordsNeeded === "Not Needed" ||
		input.asdAdhd === "ADHD" ||
		input.hasExternalRecordContent
	) {
		return null;
	}

	const sentDates = input.requestedDates.filter((d): d is string => !!d);
	if (sentDates.length === 0) {
		return "records needed but not yet requested";
	}

	const lastSent = sentDates.reduce((latest, d) =>
		compareDateOnly(d, latest) > 0 ? d : latest,
	);
	const verb = sentDates.length >= 2 ? "requested again" : "requested";
	return `records needed, ${verb} on ${formatShortDate(lastSent)}, but not yet received`;
}

const SUPPORTED_LANGUAGES = new Set(["English", "Spanish"]);

/**
 * qsend.py only sends questionnaires to English/Spanish-speaking clients
 * (a blank language is treated as English); anything else is skipped rather
 * than sent.
 */
export function getUnsupportedLanguageReason(
	language: string | null | undefined,
): string | null {
	if (!language || SUPPORTED_LANGUAGES.has(language)) return null;
	return `unsupported language: ${language}`;
}

import { compareDateOnly, formatShortDate } from "~/lib/utils";

export type RecordsBlockerInput = {
	recordsNeeded: "Needed" | "Not Needed" | null;
	asdAdhd: string | null;
	hasExternalRecordContent: boolean;
	isPrivateSchool: boolean;
	language: string | null;
	holdUntil: string | null | undefined;
	requestedDates: (string | null | undefined)[];
	/** Today's date, business-local, as "YYYY-MM-DD". */
	today: string;
};

/**
 * Mirrors get_record_ready_client_ids() and get_clients_needing_records() in
 * questionnaires/utils/database.py: describes why a client's external
 * records haven't been (and, as things are currently configured, won't be)
 * automatically requested, or null if nothing is outstanding.
 *
 * "Not Needed", an ADHD-only diagnosis, and already-present record content
 * all mean nothing further is required. Otherwise, records-request.py only
 * picks up a client from get_clients_needing_records() when they're not
 * private-school (staff handle those manually, per
 * ensurePendingExternalRecordRequest's comment), their language is exactly
 * "English" (unlike qsend.py, records-request.py does not also allow
 * Spanish), and any hold on the pending request has expired.
 */
export function getRecordsBlockerReason(
	input: RecordsBlockerInput,
): string | null {
	if (
		input.recordsNeeded === "Not Needed" ||
		input.asdAdhd === "ADHD" ||
		input.hasExternalRecordContent
	) {
		return null;
	}

	if (input.isPrivateSchool) {
		return "records needed, private-school client, records must be requested manually";
	}

	if (input.language !== "English") {
		return `records needed, but automated records requests require English (client's language is ${input.language ?? "not set"})`;
	}

	if (input.holdUntil && compareDateOnly(input.holdUntil, input.today) > 0) {
		return `records request on hold until ${formatShortDate(input.holdUntil)}`;
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

const SUPPORTED_QUESTIONNAIRE_LANGUAGES = new Set(["English", "Spanish"]);

/**
 * qsend.py only sends questionnaires to English/Spanish-speaking clients
 * (a blank language is treated as English); anything else is skipped rather
 * than sent.
 */
export function getUnsupportedLanguageReason(
	language: string | null | undefined,
): string | null {
	if (!language || SUPPORTED_QUESTIONNAIRE_LANGUAGES.has(language)) return null;
	return `unsupported language: ${language}`;
}

export type PunchQsInfo = {
	"DA Qs Needed"?: string;
	"EVAL Qs Needed"?: string;
};

/**
 * Mirrors diagnose_client's first check in qsend.py and getPartialBatteries
 * in questionnaires.ts: a client only has questionnaires outstanding once
 * staff have marked DA or EVAL Qs as needed on the prioritization sheet.
 * Nothing about the client's DB record (age, diagnosis, questionnaire
 * rules) implies this on its own, so a client with no punch-list row, or
 * with both flags unset, isn't "blocked" from anything yet.
 */
export function hasQuestionnairesNeeded(
	punchInfo: PunchQsInfo | null | undefined,
): boolean {
	return (
		punchInfo?.["DA Qs Needed"] === "TRUE" ||
		punchInfo?.["EVAL Qs Needed"] === "TRUE"
	);
}

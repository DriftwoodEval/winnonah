import { compareDateOnly, formatShortDate } from "~/lib/utils";

export type RecordsBlockerInput = {
	recordsNeeded: "Needed" | "Not Needed" | null;
	asdAdhd: string | null;
	hasExternalRecordContent: boolean;
	isPrivateSchool: boolean;
	language: string | null;
	holdUntil: string | null | undefined;
	/** Dates of requests that have actually been sent (never null entries). */
	requestedDates: (string | null | undefined)[];
	/** True when a request row exists that has not been sent yet. */
	hasPendingRequest: boolean;
	/** Today's date, business-local, as "YYYY-MM-DD". */
	today: string;
};

/**
 * Mirrors get_record_ready_client_ids() and get_clients_needing_records() in
 * questionnaires/utils/database.py: describes why a client's external
 * records haven't been (and, as things are currently configured, won't be)
 * automatically requested, or null if nothing is outstanding.
 *
 * "Not Needed" and already-present record content both mean nothing further
 * is required. An ADHD-only diagnosis (ADHD in asdAdhd, ASD absent) means an
 * outstanding request never blocks a send, but the records are still chased,
 * so a private-school ADHD-only client still needs the manual-request note
 * (get_record_ready_client_ids in questionnaires reports the same). Otherwise,
 * records-request.py only picks up a client from get_clients_needing_records()
 * when they're not private-school (staff handle those manually, per
 * ensurePendingExternalRecordRequest's comment), their language is exactly
 * "English" (unlike qsend.py, records-request.py does not also allow
 * Spanish), and any hold on the pending request has expired.
 */
/**
 * Reason returned when a client needs records but has never had a request
 * queued or sent. Redundant with the dashboard's "Records Needed - Not
 * Requested" section title, so that section filters it out.
 */
export const RECORDS_NOT_YET_REQUESTED_REASON =
	"records needed but not yet requested";

export function getRecordsBlockerReason(
	input: RecordsBlockerInput,
): string | null {
	if (input.recordsNeeded === "Not Needed" || input.hasExternalRecordContent) {
		return null;
	}

	if (input.isPrivateSchool) {
		return "records needed, private-school client, records must be requested manually";
	}

	const isAdhdOnly =
		!!input.asdAdhd &&
		input.asdAdhd.includes("ADHD") &&
		!input.asdAdhd.includes("ASD");
	if (isAdhdOnly) {
		return null;
	}

	if (input.language !== "English") {
		return `records needed, but automated records requests require English (client's language is ${input.language ?? "not set"})`;
	}

	if (input.holdUntil && compareDateOnly(input.holdUntil, input.today) > 0) {
		return `records request on hold until ${formatShortDate(input.holdUntil)}`;
	}

	const sentDates = input.requestedDates.filter((d): d is string => !!d);

	// The only records blocker left to report is a client who has never had a
	// request at all. Once a request exists (still pending, or already sent),
	// any real blocker on it (private school, wrong language, an unexpired
	// hold) has already returned above; a bare "still waiting on records" is
	// not something staff act on, so it no longer blocks a send.
	if (sentDates.length === 0 && !input.hasPendingRequest) {
		return RECORDS_NOT_YET_REQUESTED_REASON;
	}

	return null;
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

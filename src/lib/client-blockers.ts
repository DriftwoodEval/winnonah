import {
	calculateAgeYearsMonths,
	compareDateOnly,
	formatShortDate,
	sanitizeFailureReason,
} from "~/lib/utils";

export type RecordsBlockerInput = {
	recordsNeeded: "Needed" | "Not Needed" | null;
	hasExternalRecordContent: boolean;
	/** Intake says charter school but nobody has confirmed it yet. */
	isCharterSchoolUnconfirmed: boolean;
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
 * is required. Otherwise, records-request.py only picks up a client from
 * get_clients_needing_records() when any charter-school answer on intake has
 * been confirmed, their language is exactly "English" (unlike qsend.py,
 * records-request.py does not also allow Spanish), and any hold on the pending request has expired. Any
 * of those unmet is a reason staff must act, and it is reported here
 * regardless of diagnosis: an ADHD-only client's outstanding records never
 * block a questionnaire send (that gate lives elsewhere), but a records
 * request that will never go out on its own still needs a person.
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

	if (input.language !== "English") {
		return `records needed, but automated records requests require English (client's language is ${input.language ?? "not set"})`;
	}

	if (input.holdUntil && compareDateOnly(input.holdUntil, input.today) > 0) {
		return `records request on hold until ${formatShortDate(input.holdUntil)}`;
	}

	const sentDates = input.requestedDates.filter((d): d is string => !!d);

	// Held until someone confirms the charter-school answer; once a request has
	// gone out the block no longer matters.
	if (input.isCharterSchoolUnconfirmed && sentDates.length === 0) {
		return "records needed, charter school not yet confirmed";
	}

	// The only records blocker left to report is a client who has never had a
	// request at all. Once a request exists (still pending, or already sent),
	// any real blocker on it (charter school, wrong language, an unexpired
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

/**
 * Intake says the client attends a charter school, but nobody with the
 * confirm permission has pressed the confirm button yet. Mirrors the
 * unconfirmed exclusion in get_clients_needing_records() in
 * questionnaires/utils/database.py.
 */
export function isCharterSchoolUnconfirmed(
	referralData:
		| { charterSchool?: string | null; charterSchoolConfirmed?: boolean }
		| null
		| undefined,
): boolean {
	return (
		referralData?.charterSchool === "yes" &&
		!referralData.charterSchoolConfirmed
	);
}

/**
 * Flags that stop both qsend.py and records-request.py outright: a paused
 * client is skipped by both, and so is a client with "Autism" in their
 * records (autismStop).
 */
export function getHoldBlockers(client: {
	pause: boolean;
	autismStop: boolean;
}): string[] {
	const blockers: string[] = [];
	if (client.pause) blockers.push("Client paused for review.");
	if (client.autismStop) {
		blockers.push('"Autism" in records, client already identified.');
	}
	return blockers;
}

/** Mirrors SCHOOL_RECORDS_ADULT_AGE in questionnaires/utils/constants.py. */
export const SCHOOL_RECORDS_ADULT_AGE = 22;

/**
 * Mirrors the is_adhd_only check in get_record_ready_client_ids(): outstanding
 * records block questionnaires for everyone except ADHD-only clients.
 */
export function isAdhdOnly(asdAdhd: string | null | undefined): boolean {
	return !!asdAdhd?.includes("ADHD") && !asdAdhd.includes("ASD");
}

/**
 * Every reason a client's external records aren't being requested, as the
 * client page lists them: records failures (such as a school district that
 * doesn't match), a missing records-needed status, pause or autism stop, age,
 * and the getRecordsBlockerReason result. Shared by the client page and the
 * Database page's External Records table.
 */
export function getRecordsBlockers(input: {
	client: {
		recordsNeeded: "Needed" | "Not Needed" | null;
		pause: boolean;
		autismStop: boolean;
		dob: string | null;
		language: string | null;
		referralData: Parameters<typeof isCharterSchoolUnconfirmed>[0];
		sessionStartedAt: Date | null;
	};
	failures: { reason: string; daEval: string | null }[];
	hasContent: boolean;
	requests: {
		requestedDate: string | null;
		holdUntil: string | null;
		createdAt: Date;
	}[];
	today: string;
}): string[] {
	const { client, hasContent } = input;
	const sentence = (text: string) =>
		`${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

	const blockers = input.failures
		.filter((failure) => failure.daEval === "Records")
		.map((failure) => sentence(sanitizeFailureReason(failure.reason)));

	if (client.recordsNeeded === null) {
		blockers.push("Missing records-needed status.");
		return blockers;
	}

	// Pause and autism stop also halt records requests, but only matter
	// while records are actually outstanding.
	if (client.recordsNeeded === "Needed" && !hasContent) {
		blockers.push(...getHoldBlockers(client));
		const age = calculateAgeYearsMonths(client.dob)?.years;
		if (age !== undefined && age >= SCHOOL_RECORDS_ADULT_AGE) {
			blockers.push(
				`Records aren't requested for clients ${SCHOOL_RECORDS_ADULT_AGE} or older.`,
			);
		}
	}

	const currentSessionRequests = input.requests.filter(
		(request) =>
			!client.sessionStartedAt || request.createdAt >= client.sessionStartedAt,
	);
	const pendingRequest = currentSessionRequests.find(
		(request) => request.requestedDate === null,
	);
	const reason = getRecordsBlockerReason({
		recordsNeeded: client.recordsNeeded,
		hasExternalRecordContent: hasContent,
		isCharterSchoolUnconfirmed: isCharterSchoolUnconfirmed(client.referralData),
		language: client.language,
		holdUntil: pendingRequest?.holdUntil,
		hasPendingRequest: !!pendingRequest,
		requestedDates: currentSessionRequests.map((r) => r.requestedDate),
		today: input.today,
	});
	if (reason) blockers.push(sentence(reason));

	return blockers;
}

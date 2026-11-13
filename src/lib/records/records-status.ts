export const RECORDS_STATUSES = [
	"Not requested",
	"Queued",
	"On hold",
	"Requested",
	"Requested again",
	"Reviewed",
	"Not needed",
] as const;

export type RecordsStatus = (typeof RECORDS_STATUSES)[number];

export interface RecordsStatusRequest {
	/** Null until the request has actually been sent. */
	requestedDate: string | null;
	holdUntil: string | null;
}

export interface RecordsStatusInput {
	recordsNeeded: "Needed" | "Not Needed" | null;
	/** True once records notes have been entered for the client. */
	hasContent: boolean;
	/** Requests from the client's current session only. */
	requests: RecordsStatusRequest[];
	/** Business-local "YYYY-MM-DD". */
	today: string;
}

export interface RecordsSummary {
	status: RecordsStatus;
	/** Most recent date a request was sent, or null if none has been. */
	latestRequestedDate: string | null;
	/** How many requests have been sent. */
	requestCount: number;
	/** Hold date on a request that is waiting to be sent, if any. */
	holdUntil: string | null;
}

/**
 * Where a client's external records stand. A request row with no requested
 * date is queued for sending; one with a hold date in the future is on hold.
 * Entered records notes mean the records came back and were reviewed.
 */
export function summarizeRecords(input: RecordsStatusInput): RecordsSummary {
	const sent = input.requests.filter((r) => r.requestedDate);
	const waiting = input.requests.filter((r) => !r.requestedDate);

	const latestRequestedDate =
		sent
			.map((r) => r.requestedDate as string)
			.sort()
			.at(-1) ?? null;
	const holdUntil =
		waiting
			.map((r) => r.holdUntil)
			.filter((date): date is string => !!date && date >= input.today)
			.sort()
			.at(-1) ?? null;

	const summary = {
		latestRequestedDate,
		requestCount: sent.length,
		holdUntil,
	};

	if (input.recordsNeeded === "Not Needed") {
		return { ...summary, status: "Not needed" };
	}
	if (input.hasContent) {
		return { ...summary, status: "Reviewed" };
	}
	if (sent.length > 1) {
		return { ...summary, status: "Requested again" };
	}
	if (sent.length === 1) {
		return { ...summary, status: "Requested" };
	}
	if (holdUntil) {
		return { ...summary, status: "On hold" };
	}
	if (waiting.length > 0) {
		return { ...summary, status: "Queued" };
	}
	return { ...summary, status: "Not requested" };
}

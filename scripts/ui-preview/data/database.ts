import { getRecordsBlockers } from "~/lib/client-blockers";
import { QUESTIONNAIRE_STATUSES } from "~/lib/constants";
import { summarizeRecords } from "~/lib/records/records-status";
import { FAKE_CLIENTS, isNotesOnlyClient } from "./clients";

const DAY = 86_400_000;
const NOW = new Date("2026-11-22T15:00:00.000Z").getTime();
const TODAY = "2026-11-22";
const people = FAKE_CLIENTS.filter((c) => !isNotesOnlyClient(c));
const dateOnly = (daysAgo: number) =>
	new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10);

const TYPES = ["ASQ", "SRS", "BASC", "Vineland", "CBCL", "Conners", "SCQ"];
const REPLIES = [
	"Thanks, finished it last night.",
	"We are using the Spanish form instead.",
	"Please stop texting this number.",
];

/** `questionnaires.listAll`: every status, mixed reminder counts, PDF states, and appointment dates. */
export const questionnairesListAll = people.slice(0, 80).flatMap((c, i) =>
	Array.from({ length: 1 + (i % 3) }, (_, k) => {
		const n = i * 3 + k;
		const status = QUESTIONNAIRE_STATUSES.filter((s) => s !== "ARCHIVED")[
			n % (QUESTIONNAIRE_STATUSES.length - 1)
		] as (typeof QUESTIONNAIRE_STATUSES)[number];
		const completed = status === "COMPLETED";
		const hasAppointment = n % 4 !== 0;
		const past = n % 3 === 0;
		return {
			id: n + 1,
			clientId: c.id,
			clientHash: c.hash,
			clientName: c.fullName,
			clientActive: c.status,
			clientDriveId: c.driveId,
			questionnaireType: TYPES[n % TYPES.length] as string,
			status,
			sent: n % 11 === 0 ? null : dateOnly(n % 60),
			reminded: n % 4,
			lastReminded: n % 4 === 0 ? null : dateOnly(n % 20),
			pdfFileId: completed && n % 2 === 0 ? `pdf-${n}` : null,
			pdfCheckedAt: completed && n % 2 === 1 ? new Date(NOW - DAY) : null,
			responseText: status === "RESPONDED" ? (REPLIES[n % 3] as string) : null,
			appointment: hasAppointment
				? new Date(NOW + (past ? -1 : 1) * ((n % 25) + 1) * DAY)
				: null,
			appointmentIsPast: hasAppointment && past,
		};
	}),
);

/** `externalRecords.listAll`, built with the same helpers the router uses. */
export const externalRecordsListAll = people.slice(0, 90).flatMap((c, i) => {
	const hasContent = i % 7 === 0;
	const requests = (
		i % 5 === 0
			? []
			: [
					{ requestedDate: dateOnly(30 + i), holdUntil: null },
					...(i % 5 === 1
						? [{ requestedDate: dateOnly(5), holdUntil: null }]
						: []),
					...(i % 5 === 2
						? [{ requestedDate: null, holdUntil: dateOnly(-9) }]
						: []),
					...(i % 5 === 3 ? [{ requestedDate: null, holdUntil: null }] : []),
				]
	).map((r) => ({ ...r, createdAt: new Date(NOW - 40 * DAY) }));
	const recordsNeeded = i % 9 === 0 ? null : c.recordsNeeded;
	if (!recordsNeeded && !hasContent && requests.length === 0) return [];
	const summary = summarizeRecords({
		recordsNeeded,
		hasContent,
		requests,
		today: TODAY,
	});
	const failures =
		i % 6 === 0
			? [{ reason: "school district does not match", daEval: "Records" }]
			: [];
	return [
		{
			clientId: c.id,
			clientHash: c.hash,
			clientName: c.fullName,
			clientActive: c.status,
			recordsNeeded,
			status: summary.status,
			latestRequestedDate: summary.latestRequestedDate,
			requestCount: summary.requestCount,
			holdUntil: summary.holdUntil,
			blockers:
				summary.requestCount > 0
					? []
					: getRecordsBlockers({
							client: { ...c, recordsNeeded },
							failures,
							hasContent,
							requests,
							today: TODAY,
						}),
			notesUpdatedAt: hasContent ? new Date(NOW - 3 * DAY) : null,
		},
	];
});

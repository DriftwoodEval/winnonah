import {
	getDashboardSections,
	getDuplicatePunchClients,
} from "~/lib/dashboard";
import type { FullClientInfo } from "~/lib/models";
import { FAKE_CLIENTS, isNotesOnlyClient } from "./clients";

const real = FAKE_CLIENTS.filter((c) => !isNotesOnlyClient(c));
const active = real.filter((c) => c.status);

const T = "TRUE";
const F = "FALSE";
const future = (days: number) =>
	new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

type Punch = Pick<
	FullClientInfo,
	| "DA Qs Needed"
	| "DA Qs Sent"
	| "DA Qs Done"
	| "DA Scheduled"
	| "EVAL Qs Needed"
	| "EVAL Qs Sent"
	| "EVAL Qs Done"
	| "EVAL date"
>;
const none: Punch = {
	"DA Qs Needed": F,
	"DA Qs Sent": F,
	"DA Qs Done": F,
	"DA Scheduled": undefined,
	"EVAL Qs Needed": F,
	"EVAL Qs Sent": F,
	"EVAL Qs Done": F,
	"EVAL date": undefined,
};

/** Workflow states, one per dashboard section; rows cycle through them. */
const STEPS: Partial<Punch>[] = [
	{},
	{ "DA Qs Needed": T },
	{ "DA Qs Needed": T, "DA Qs Sent": T },
	{ "DA Qs Needed": T, "DA Qs Sent": T, "DA Qs Done": T },
	{
		"DA Qs Needed": T,
		"DA Qs Sent": T,
		"DA Qs Done": T,
		"DA Scheduled": future(9),
	},
	{
		"DA Qs Needed": T,
		"DA Qs Sent": T,
		"DA Qs Done": T,
		"DA Scheduled": future(-9),
	},
	{ "DA Qs Sent": T, "EVAL Qs Needed": T },
	{ "DA Qs Needed": T, "EVAL Qs Needed": T },
	{ "EVAL Qs Needed": T, "EVAL Qs Sent": T },
	{ "DA Qs Sent": T, "EVAL Qs Sent": T },
	{ "EVAL Qs Needed": T, "EVAL Qs Sent": T, "EVAL Qs Done": T },
	{ "DA Qs Done": T, "EVAL Qs Done": T },
	{ "EVAL Qs Done": T, "EVAL date": future(14) },
	{ "EVAL Qs Done": T, "EVAL date": future(-14) },
];

function questionnairesFor(c: (typeof real)[number], p: Punch) {
	const row = (
		type: string,
		status: "PENDING" | "COMPLETED",
		reminded: number,
	) => ({
		id: c.id * 10 + (type === "DA" ? 1 : 2),
		clientId: c.id,
		questionnaireType: type,
		link: `https://example.com/q/${c.id}/${type}`,
		sent: "2026-11-10",
		status,
		reminded,
		lastReminded: reminded ? "2026-11-18" : null,
		pdfFileId: null,
		pdfCheckedAt: null,
		responseText: null,
		updatedAt: new Date("2026-11-18T15:00:00.000Z"),
	});
	return [
		...(p["DA Qs Sent"] === T
			? [row("DA", p["DA Qs Done"] === T ? "COMPLETED" : "PENDING", c.id % 4)]
			: []),
		...(p["EVAL Qs Sent"] === T
			? [
					row(
						"EVAL",
						p["EVAL Qs Done"] === T ? "COMPLETED" : "PENDING",
						c.id % 3,
					),
				]
			: []),
	];
}

/** One punchlist sheet row. Each fake client lands at a different step of the workflow. */
function punchRow(c: (typeof real)[number], i: number): FullClientInfo {
	const step = i % (STEPS.length + 2);
	const punch: Punch = { ...none, ...STEPS[step] };
	const ready = step < STEPS.length;
	// Every other row with a sent step has no EMR questionnaires ("Sent on punch, no Qs in EMR").
	const qs = i % 5 === 4 ? [] : questionnairesFor(c, punch);
	return {
		...c,
		...punch,
		recordsNeeded: ready && i % 3 !== 0 ? "Not Needed" : c.recordsNeeded,
		questionnaires: qs,
		hasPast96130Appt: step === 13,
		hasExternalRecordsNote: c.recordsNeeded === "Needed" && i % 3 !== 0,
		externalRecordsRequestedDate: i % 2 === 0 ? "2026-11-01" : null,
		"Client Name": c.fullName,
		"Client ID": String(c.id),
		For: c.firstName,
		Language: c.language ?? undefined,
		"PA Assigned to": c.paAssignedTo ?? undefined,
		"PA Expiration": c.precertExpires ?? undefined,
		"Primary Payer": c.primaryInsurance ?? undefined,
		"Secondary Payer": c.secondaryInsurance?.[0],
		Location: "Greenville",
		Comments: i % 5 === 0 ? "Parent prefers afternoons" : undefined,
		"DA IN FOLDER/ NEEDS REPT WRITTEN": undefined,
		"Protocols scanned?": undefined,
		"Ready to assign?": undefined,
		Evaluator: undefined,
		"Assigned to OR added to report writing folder": undefined,
		"MCS Review Needed": undefined,
		"AJP Review Done/Hold for payroll": undefined,
		"Billed?": undefined,
		hash: c.hash,
	};
}

/** Active clients on the sheet, plus two inactive ones and one duplicate row. */
const punchClients: FullClientInfo[] = [
	...active.slice(0, 60),
	...real.filter((c) => !c.status).slice(0, 2),
].map(punchRow);
const duplicate = punchClients[3];
if (duplicate) punchClients.push({ ...duplicate });

const missingClients = active.slice(60, 66);
const withReferral = (
	c: (typeof real)[number],
	needs: "reach_out" | "review",
) => ({
	...c,
	referralData: { needsReachOut: needs, outreachAttempts: [] },
});
const needsReachOut = active
	.slice(66, 70)
	.map((c) => withReferral(c, "reach_out"));
const needsReview = active.slice(70, 73).map((c) => withReferral(c, "review"));

export const dashboardData = {
	punchClients,
	missingClients,
	needsReachOut,
	needsReview,
	sections: getDashboardSections(
		punchClients,
		missingClients,
		needsReachOut as never,
		needsReview as never,
	),
	punchlistCount: punchClients.length,
	duplicatePunchClients: getDuplicatePunchClients(punchClients).map(
		({ client, count }) => ({
			hash: client.hash,
			name: client["Client Name"] ?? String(client.id),
			count,
		}),
	),
};

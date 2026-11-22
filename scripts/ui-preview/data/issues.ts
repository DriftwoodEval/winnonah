import { FAKE_CLIENTS, isNotesOnlyClient } from "./clients";

const DAY = 86_400_000;
const NOW = new Date("2026-11-21T15:00:00.000Z").getTime();

const real = FAKE_CLIENTS.filter((c) => c.status && !isNotesOnlyClient(c));
const notesOnly = FAKE_CLIENTS.filter((c) => c.status && isNotesOnlyClient(c));
const withInfo = (list: typeof real, info: (i: number) => string) =>
	list.map((c, i) => ({ ...c, additionalInfo: info(i) }));

/** Date 22 years before the preview's fixed "now", as `YYYY-MM-DD`. */
const adultCutoff = new Date(NOW - 22 * 365 * DAY).toISOString().slice(0, 10);

/** Issue lists derived from the fake clients, so each row opens a real fake client page. */
export const ISSUE_LISTS = {
	"clients.getBabyNetErrors": real.filter((c) => c.babyNet).slice(0, 4),
	"clients.getAdultClients": real.filter((c) => c.dob && c.dob <= adultCutoff),
	"clients.getNotInTAErrors": FAKE_CLIENTS.filter((c) => !c.addedDate),
	"clients.getNoDriveIdErrors": real.filter((c) => !c.driveId).slice(0, 6),
	"clients.getDD4": real
		.slice(0, 3)
		.map((c) => ({ ...c, schoolDistrict: "Dorchester School District 4" })),
	"clients.getNoReferralSource": real.filter((c) => !c.referralSource),
	"clients.getMedicaidNotFound": real.filter((c) => c.medicaidNotFound),
	"clients.getMedicaidIneligible": real.filter(
		(c) => c.medicaidBeneficiaryStatus === "INELIGIBLE",
	),
	"clients.getInsuranceMismatch": withInfo(
		real.filter((c) => c.medicaidOrganization).slice(0, 4),
		() => "(Org: Select Health of SC)",
	),
	"clients.getUnconfirmedCharterSchool": real
		.filter((c) => c.recordsNeeded === "Needed")
		.slice(0, 3),
	"clients.getUnreviewedRecords": withInfo(
		real.filter((c) => c.recordsNeeded === "Needed").slice(3, 8),
		(i) => `(Requested: 11/${String(1 + i).padStart(2, "0")}/26)`,
	),
	"clients.getSpecialAccommodations": withInfo(
		real.slice(10, 13),
		(i) => ["(Spanish)", "(Arabic)", "(Vietnamese)"][i] as string,
	),
	"clients.getDdsRequests": real.slice(20, 24).map((c, i) => ({
		...c,
		ddsRequestId: 500 + i,
		ddsFileId: i === 3 ? null : `file-${i}`,
		ddsCoverNote: i === 2 ? "Please send the latest evaluation." : null,
		additionalInfo:
			i === 3
				? "No psychological evaluation found"
				: i === 2
					? "Cover page only"
					: `${c.lastName}_eval_2026.pdf`,
	})),
	"clients.getPossiblePrivatePay": withInfo(
		real.filter((c) => !c.primaryInsurance).slice(0, 4),
		(i) =>
			[
				"No insurance on file",
				"No eligible evaluators",
				"Insurance not accepted",
				"No insurance on file",
			][i] as string,
	),
	"clients.getMissingAppointments": withInfo(
		real.slice(60, 65),
		(i) => `(${i % 3} of 3 appointments)`,
	),
	"questionnaires.getJustAdded": real.slice(70, 74),
	"questionnaires.getPartialBatteries": real.slice(80, 86).flatMap((c, i) => [
		{
			...c,
			daeval: (i % 2 === 0 ? "DA" : "EVAL") as "DA" | "EVAL",
			missingTypes: ["BASC", "Vineland"].slice(0, 1 + (i % 2)),
			sentTypes: ["SRS", "CBCL"],
			hasDocsNotSigned: i % 3 === 0,
			hasPortalNotOpened: i % 3 === 1,
		},
		...(i === 5
			? [
					{
						...c,
						daeval: "DA" as const,
						missingTypes: ["Conners"],
						sentTypes: [],
						hasDocsNotSigned: false,
						hasPortalNotOpened: false,
					},
				]
			: []),
	]),
	"clients.getDropList": real.slice(30, 36).map((c, i) => ({
		...c,
		additionalInfo:
			i % 2 === 0
				? "Qs pending (3 reminders)"
				: "Qs pending (3 reminders, post-eval)",
		initialFailureDate: new Date(NOW - (20 + i * 9) * DAY),
	})),
} satisfies Record<string, unknown[]>;

/** `clients.getMergeSuggestions`: each notes-only client with real clients that might be the same person. */
export const mergeSuggestions = notesOnly.map((n, i) => ({
	notesOnlyClient: n,
	suggestedRealClients: real
		.slice(40 + i * 3, 43 + i * 3)
		.map((c, d) => ({ ...c, distance: d })),
}));

/** `clients.getDuplicateNames`: two clients sharing a name, plus a three-way group. */
export const duplicateNames = [0, 1].map((g) => {
	const base = real[50 + g] as (typeof real)[number];
	const copies = [100_900 + g * 10, 100_901 + g * 10, 100_902 + g * 10].slice(
		0,
		g === 0 ? 2 : 3,
	);
	const group = [
		base,
		...copies.map((id) => ({ ...base, id, hash: `hash${id}` })),
	];
	const pairs = group.flatMap((a, i) =>
		group.slice(i + 1).map((b) => ({ clientA: a, clientB: b })),
	);
	return { name: base.fullName, pairs };
});

/** `adminReview.getAllEnabled`: clients in admin review, some claimed, some waiting. */
export const adminReviewEnabled = real.slice(90, 96).map((c, i) => ({
	clientId: c.id,
	clientName: c.fullName,
	clientHash: c.hash,
	claimedUserEmail:
		i % 3 === 0
			? "preview@example.com"
			: i % 3 === 1
				? "taylor@example.com"
				: null,
	claimedUserName:
		i % 3 === 0 ? "Preview User" : i % 3 === 1 ? "Taylor Brooks" : null,
	waiting: i % 4 === 2,
}));

/** `google.findDuplicates`: clients with more than one Drive folder, one marked canonical. */
export const duplicateDriveFolders = {
	lastFetched: NOW - 3 * 3_600_000,
	data: real.slice(60, 63).map((c, g) => ({
		clientId: String(c.id),
		clientHash: c.hash,
		clientFullName: c.fullName,
		folders: Array.from({ length: 2 + (g % 2) }, (_, i) => ({
			id: `folder-${c.id}-${i}`,
			name: `${c.lastName}, ${c.firstName} ${c.id}`,
			url: `https://example.com/drive/${c.id}-${i}`,
			isDbMatch: i === 0,
		})),
	})),
};

/** `questionnaires.getDuplicateLinks`: repeated links per client, and links shared by several clients. */
export const duplicateQuestionnaireLinks = {
	duplicatePerClient: real.slice(70, 73).map((c, i) => ({
		link: `https://example.com/q/dup-${c.id}`,
		client: c,
		count: 2 + i,
	})),
	sharedAcrossClients: [0, 1].map((g) => ({
		link: `https://example.com/q/shared-${g}`,
		clients: real
			.slice(75 + g * 3, 77 + g * 3 + g)
			.map((c) => ({ client: c, count: 1 })),
	})),
};

/** `google.verifyPunchClients`: punchlist rows with unknown ids, inactive clients, and repeated ids. */
// lazy: the real rows also carry every Punchlist sheet column (80+); the page reads only a few, so the shape is not checked.
export const punchlistIssues = {
	clientsNotInDb: [0, 1, 2].map((i) => ({
		"Client ID": String(999_100 + i),
		"Client Name": (real[80 + i] as (typeof real)[number]).fullName,
		suggestions: real.slice(80 + i, 82 + i),
	})),
	inactiveClients: real.slice(84, 88).map((c) => ({ ...c, status: false })),
	duplicateIdClients: real.slice(88, 90).map((c, i) => ({
		...c,
		"Client ID": String(c.id),
		"Client Name": c.fullName,
		duplicateCount: 2 + i,
	})),
} as never;

/** `clients.getDistrictErrors`: active children without a district, and low-confidence address lookups. */
export const districtErrors = {
	clientsWithoutDistrict: real
		.slice(20, 25)
		.map((c) => ({ ...c, schoolDistrict: "Unknown" })),
	clientsWithPoorAddressLookup: real
		.slice(25, 29)
		.map((c) => ({ ...c, flag: "poor_address_lookup" })),
};

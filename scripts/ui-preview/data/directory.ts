import { OFFICE_DRIVE_TIMES } from "./clientExtras";
import { FAKE_CLIENTS, type FakeClient, isNotesOnlyClient } from "./clients";

const NONE = "__none__";

type DirectoryInput = {
	nameSearch?: string;
	status?: "active" | "inactive" | "all";
	asdAdhd?: string[];
	primaryInsurance?: string[];
	language?: string[];
	color?: string[];
};

/** Real clients only, filtered the way the directory's server query filters them. */
function filtered(input: DirectoryInput | undefined): FakeClient[] {
	const status = input?.status ?? "active";
	const search = input?.nameSearch?.trim().toLowerCase();
	return FAKE_CLIENTS.filter((c) => {
		if (isNotesOnlyClient(c)) return false;
		if (status === "active" && !c.status) return false;
		if (status === "inactive" && c.status) return false;
		if (search && !c.fullName.toLowerCase().includes(search)) return false;
		if (input?.asdAdhd?.length && !input.asdAdhd.includes(c.asdAdhd ?? NONE))
			return false;
		if (
			input?.primaryInsurance?.length &&
			!input.primaryInsurance.includes(c.primaryInsurance ?? NONE)
		)
			return false;
		if (input?.language?.length && !input.language.includes(c.language ?? NONE))
			return false;
		if (input?.color?.length && !input.color.includes(c.color)) return false;
		return true;
	});
}

function blockersFor(c: FakeClient): string[] {
	const blockers: string[] = [];
	if (c.pause) blockers.push("paused");
	if (c.recordsNeeded === null) blockers.push("missing records-needed status");
	return blockers;
}

function sortReason(c: FakeClient): string {
	if (c.babyNet && c.highPriority) return "BabyNet and High Priority";
	if (c.babyNet) return "BabyNet above 2:6";
	if (c.highPriority) return "High Priority";
	return "Added Date";
}

export function directory(input: DirectoryInput | undefined) {
	return filtered(input).map((c) => ({
		id: c.id,
		hash: c.hash,
		fullName: c.fullName,
		asdAdhd: c.asdAdhd,
		primaryInsurance: c.primaryInsurance,
		secondaryInsurance: c.secondaryInsurance ?? [],
		language: c.language,
		paAssignedTo: c.paAssignedTo,
		status: c.status,
		color: c.color,
		dob: c.dob,
		addedDate: c.addedDate,
		pause: c.pause,
		recordsNeeded: c.recordsNeeded,
		sessionStartedAt: c.sessionStartedAt,
		referralData: c.referralData,
		sortReason: sortReason(c),
		unresolvedFailures: blockersFor(c),
		priorAuthDate: null,
		daScheduled: false,
		daScheduledDate: null,
		evalScheduled: false,
		evalScheduledDate: null,
		location: null,
		evaluator: null,
		noteTitle: null,
		reportWriter: null,
		reportStatus: null,
	}));
}

function countMap(values: (string | null)[]) {
	const counts: Record<string, number> = {};
	for (const v of values) counts[v ?? NONE] = (counts[v ?? NONE] ?? 0) + 1;
	return { counts, total: values.length };
}

export function directoryFacetCounts(input: DirectoryInput | undefined) {
	const rows = filtered({ ...input, status: "all" });
	const secondary: Record<string, number> = {};
	for (const c of rows) {
		const names = c.secondaryInsurance?.length ? c.secondaryInsurance : [NONE];
		for (const n of new Set(names)) secondary[n] = (secondary[n] ?? 0) + 1;
	}
	const high = rows.filter((c) => c.highPriority && !c.babyNet).length;
	const baby = rows.filter((c) => c.babyNet && !c.highPriority).length;
	const both = rows.filter((c) => c.babyNet && c.highPriority).length;
	return {
		asdAdhd: countMap(rows.map((c) => c.asdAdhd)),
		primaryInsurance: countMap(rows.map((c) => c.primaryInsurance)),
		secondaryInsurance: { counts: secondary, total: rows.length },
		language: countMap(rows.map((c) => c.language)),
		color: countMap(rows.map((c) => c.color)),
		status: countMap(rows.map((c) => (c.status ? "active" : "inactive"))),
		priority: {
			counts: { highPriority: high, babyNet: baby, both },
			total: high + baby + both,
		},
	};
}

export const uniqueLanguages = [
	...new Set(
		FAKE_CLIENTS.map((c) => c.language).filter((l): l is string => !!l),
	),
].sort();

type ClientLookup = {
	id?: number;
	hash?: string;
	column?: string;
	value?: string | number;
};

/** Finds the client a `getOne` or `getCardSummary` input names, falling back to the first client. */
function lookup(input: ClientLookup | undefined): FakeClient {
	const found = FAKE_CLIENTS.find((c) =>
		input?.column
			? String(c[input.column as "id" | "hash"]) === String(input.value)
			: c.id === input?.id || c.hash === input?.hash,
	);
	return found ?? (FAKE_CLIENTS[0] as FakeClient);
}

export function getOne(input: ClientLookup | undefined) {
	return {
		...lookup(input),
		relatedConnections: [],
		questionnaires: [],
		failures: [],
		primaryInsuranceDetails: null,
		eiContact: null,
		contacts: [],
		closestOffices: lookup(input).latitude ? OFFICE_DRIVE_TIMES : [],
		schoolDistrictDetails: undefined,
		isOnDropList: false,
		dropListReason: null,
		initialFailureDate: undefined,
	};
}

export function getCardSummary(input: ClientLookup | undefined) {
	const c = lookup(input);
	return {
		id: c.id,
		fullName: c.fullName,
		color: c.color,
		dob: c.dob,
		gender: c.gender,
		language: c.language,
		asdAdhd: c.asdAdhd,
		phoneNumber: c.phoneNumber,
		email: c.email,
		address: c.address,
		schoolDistrict: c.schoolDistrict,
		primaryInsurance: c.primaryInsurance,
		secondaryInsurance: c.secondaryInsurance,
		precertExpires: c.precertExpires,
		privatePay: c.privatePay,
		outstandingBalance: c.outstandingBalance,
		addedDate: c.addedDate,
		highPriority: c.highPriority,
		babyNet: c.babyNet,
		pause: c.pause,
		autismStop: c.autismStop,
		alreadyDx: c.alreadyDx,
		status: c.status,
		pendingQuestionnaires: 2,
		assignedEvaluators: ["Dr. Alex Rivera"],
		dashboardSections: [] as string[],
		nextAppointment: null,
		lastAppointment: null,
	};
}

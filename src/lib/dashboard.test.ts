import { describe, expect, it } from "vitest";
import {
	DASHBOARD_CONFIG,
	type DashboardClient,
	getClientFailureSections,
	getClientIssueListSections,
	getClientMatchedSections,
	getDashboardSections,
	getDuplicatePunchClients,
	getInactivePunchClients,
	SECTION_ACTIVE_NOT_ON_PUNCHLIST,
	SECTION_DA_QS_DONE,
	SECTION_INACTIVE_ON_PUNCHLIST,
	SECTION_ISSUE_AUTISM_STOP,
	SECTION_ISSUE_DD4,
	SECTION_ISSUE_DROP_LIST,
	SECTION_ISSUE_EVALUATION_IN_PROCESS,
	SECTION_ISSUE_NO_REFERRAL_SOURCE,
	SECTION_ISSUE_PAUSED,
	SECTION_JUST_ADDED,
	SECTION_MULTIPLE_FILTERS,
	SECTION_NEEDS_OUTREACH,
	SECTION_REACHED_OUT_NEEDS_REVIEW,
	sortNeedsReachOut,
} from "./dashboard";
import type { Client, Failure, FullClientInfo } from "./models";

function client(overrides: Partial<Client> & { id: number }): Client {
	return {
		referralData: null,
		...overrides,
	} as Client;
}

describe("sortNeedsReachOut", () => {
	it("returns an empty array for undefined input", () => {
		expect(sortNeedsReachOut(undefined)).toEqual([]);
	});

	it("drops clients with 3 or more outreach attempts", () => {
		const c = client({
			id: 1,
			referralData: {
				outreachAttempts: [
					{ attemptedAt: "2020-01-01" },
					{ attemptedAt: "2020-01-02" },
					{ attemptedAt: "2020-01-03" },
				],
			},
		} as never);
		expect(sortNeedsReachOut([c])).toEqual([]);
	});

	it("keeps clients with no attempts in natural order", () => {
		const a = client({ id: 1 });
		const b = client({ id: 2 });
		expect(sortNeedsReachOut([a, b])).toEqual([a, b]);
	});

	it("pushes recently attempted clients to the bottom", () => {
		const recent = client({
			id: 1,
			referralData: {
				outreachAttempts: [{ attemptedAt: new Date().toISOString() }],
			},
		} as never);
		const untouched = client({ id: 2 });
		expect(sortNeedsReachOut([recent, untouched])).toEqual([untouched, recent]);
	});

	it("treats an attempt older than the cooldown as eligible again", () => {
		const old = client({
			id: 1,
			referralData: {
				outreachAttempts: [{ attemptedAt: "2000-01-01T00:00:00Z" }],
			},
		} as never);
		expect(sortNeedsReachOut([old])).toEqual([old]);
	});
});

describe("getInactivePunchClients", () => {
	it("returns only clients with status false", () => {
		const clients = [{ status: true }, { status: false }, { status: null }];
		expect(getInactivePunchClients(clients)).toEqual([{ status: false }]);
	});

	it("returns an empty array for undefined input", () => {
		expect(getInactivePunchClients(undefined)).toEqual([]);
	});
});

describe("getDuplicatePunchClients", () => {
	it("returns one entry per duplicated client id with a count", () => {
		const clients = [
			{ "Client ID": "1" },
			{ "Client ID": "2" },
			{ "Client ID": "1" },
			{ "Client ID": "1" },
		];
		const result = getDuplicatePunchClients(clients);
		expect(result).toEqual([{ client: clients[0], count: 3 }]);
	});

	it("returns an empty array when there are no duplicates", () => {
		expect(getDuplicatePunchClients([{ "Client ID": "1" }])).toEqual([]);
	});

	it("ignores rows with no client id", () => {
		expect(getDuplicatePunchClients([{}, {}])).toEqual([]);
	});
});

describe("DASHBOARD_CONFIG filters", () => {
	function fullClient(overrides: Partial<FullClientInfo>): FullClientInfo {
		return {
			id: 1,
			recordsNeeded: undefined,
			babyNetERNeeded: undefined,
			babyNetERDownloaded: undefined,
			externalRecordsRequestedDate: undefined,
			hasExternalRecordsNote: undefined,
			"DA Qs Needed": undefined,
			"DA Qs Sent": undefined,
			"DA Qs Done": undefined,
			"DA Scheduled": undefined,
			"EVAL Qs Needed": undefined,
			"EVAL Qs Sent": undefined,
			"EVAL Qs Done": undefined,
			"EVAL date": undefined,
			hasPast96130Appt: undefined,
			"Protocols scanned?": undefined,
			...overrides,
		} as FullClientInfo;
	}

	function configFor(title: string) {
		const config = DASHBOARD_CONFIG.find((c) => c.title === title);
		if (!config) throw new Error(`missing config for ${title}`);
		return config;
	}

	it("matches Records Status Not Set when recordsNeeded is unset", () => {
		const config = configFor("Records Status Not Set");
		expect(config.filter(fullClient({}))).toBe(true);
		expect(config.filter(fullClient({ recordsNeeded: "Needed" }))).toBe(false);
	});

	it("matches DA Qs Done when DA is finished but not yet scheduled", () => {
		const config = configFor(SECTION_DA_QS_DONE);
		expect(
			config.filter(
				fullClient({
					"DA Qs Done": "TRUE",
					"EVAL Qs Needed": "FALSE",
				}),
			),
		).toBe(true);
		expect(
			config.filter(
				fullClient({
					"DA Qs Done": "TRUE",
					"DA Scheduled": "TRUE",
					"EVAL Qs Needed": "FALSE",
				}),
			),
		).toBe(false);
	});
});

describe("getDashboardSections", () => {
	it("includes missing-from-punchlist clients in the first section", () => {
		const missing = [{ id: 1 }] as Client[];
		const sections = getDashboardSections(
			undefined,
			missing,
			undefined,
			undefined,
		);
		const section = sections.find(
			(s) => s.title === SECTION_ACTIVE_NOT_ON_PUNCHLIST,
		);
		expect(section?.clients).toEqual(missing);
	});

	it("includes inactive punch clients in their own section", () => {
		const punch = [
			{ id: 1, status: false, "Client ID": "1" },
		] as FullClientInfo[];
		const sections = getDashboardSections(
			punch,
			undefined,
			undefined,
			undefined,
		);
		const section = sections.find(
			(s) => s.title === SECTION_INACTIVE_ON_PUNCHLIST,
		);
		expect(section?.clients).toEqual(punch);
	});

	it("puts an active punch client matching no filter into Just Added", () => {
		const punch = [
			{
				id: 1,
				status: true,
				"Client ID": "1",
				recordsNeeded: "Unknown",
			},
		] as unknown as FullClientInfo[];
		const sections = getDashboardSections(
			punch,
			undefined,
			undefined,
			undefined,
		);
		const justAdded = sections.find((s) => s.title === SECTION_JUST_ADDED);
		expect(justAdded?.clients.map((c) => c.id)).toEqual([1]);
	});

	it("includes clients marked as needing outreach who aren't on the punchlist", () => {
		const needsReachOut = [{ id: 5 }] as Client[];
		const sections = getDashboardSections(
			undefined,
			undefined,
			needsReachOut,
			undefined,
		);
		const section = sections.find((s) => s.title === SECTION_NEEDS_OUTREACH);
		expect(section?.clients.map((c) => (c as DashboardClient).id)).toEqual([5]);
	});

	it("includes clients needing review who aren't on the punchlist", () => {
		const needsReview = [{ id: 7 }] as Client[];
		const sections = getDashboardSections(
			undefined,
			undefined,
			undefined,
			needsReview,
		);
		const section = sections.find(
			(s) => s.title === SECTION_REACHED_OUT_NEEDS_REVIEW,
		);
		expect(section?.clients.map((c) => (c as DashboardClient).id)).toEqual([7]);
	});

	it("flags clients matching multiple filters", () => {
		const punch = [
			{
				id: 1,
				status: true,
				"Client ID": "1",
				recordsNeeded: undefined,
				babyNetERNeeded: undefined,
				babyNetERDownloaded: undefined,
			},
		] as unknown as FullClientInfo[];
		const sections = getDashboardSections(
			punch,
			undefined,
			undefined,
			undefined,
		);
		const multi = sections.find((s) => s.title === SECTION_MULTIPLE_FILTERS);
		expect(multi?.clients).toEqual([]);
	});
});

describe("getClientMatchedSections", () => {
	it("returns Needs Outreach for a client only in needsReachOut", () => {
		const result = getClientMatchedSections(
			{ id: 1 },
			undefined,
			undefined,
			[{ id: 1 }] as Client[],
			undefined,
		);
		expect(result).toEqual([SECTION_NEEDS_OUTREACH]);
	});

	it("returns Active Not On Punchlist for a missing client", () => {
		const result = getClientMatchedSections(
			{ id: 1 },
			undefined,
			[{ id: 1 }] as Client[],
			undefined,
			undefined,
		);
		expect(result).toEqual([SECTION_ACTIVE_NOT_ON_PUNCHLIST]);
	});

	it("returns Just Added for a punch client matching no filter", () => {
		const punch = [
			{
				id: 1,
				recordsNeeded: "Unknown",
			},
		] as unknown as FullClientInfo[];
		const result = getClientMatchedSections(
			{ id: 1 },
			punch,
			undefined,
			undefined,
			undefined,
		);
		expect(result).toEqual([SECTION_JUST_ADDED]);
	});

	it("returns an empty array for a client matching nothing", () => {
		const result = getClientMatchedSections(
			{ id: 99 },
			undefined,
			undefined,
			undefined,
			undefined,
		);
		expect(result).toEqual([]);
	});
});

function failure(overrides: Partial<Failure> & { reason: string }): Failure {
	return {
		clientId: 1,
		daEval: null,
		failedDate: "2026-01-01",
		updatedAt: new Date(),
		reminded: 0,
		lastReminded: null,
		...overrides,
	} as Failure;
}

describe("getClientIssueListSections", () => {
	it("returns an empty array for a client matching no issue list", () => {
		expect(
			getClientIssueListSections({
				id: 1,
				status: true,
				referralSource: "Physician",
			}),
		).toEqual([]);
	});

	it("flags DD4 only for active clients in that district", () => {
		expect(
			getClientIssueListSections({
				id: 1,
				status: true,
				schoolDistrict: "Dorchester School District 4",
				referralSource: "Physician",
			}),
		).toEqual([SECTION_ISSUE_DD4]);
		expect(
			getClientIssueListSections({
				id: 1,
				status: false,
				schoolDistrict: "Dorchester School District 4",
				referralSource: "Physician",
			}),
		).toEqual([]);
	});

	it("flags paused clients regardless of status", () => {
		expect(
			getClientIssueListSections({ id: 1, status: false, pause: true }),
		).toEqual([SECTION_ISSUE_PAUSED]);
	});

	it("flags active autism-stop clients", () => {
		expect(
			getClientIssueListSections({
				id: 1,
				status: true,
				autismStop: true,
				referralSource: "Physician",
			}),
		).toEqual([SECTION_ISSUE_AUTISM_STOP]);
	});

	it("flags active evaluation-in-process clients", () => {
		expect(
			getClientIssueListSections({
				id: 1,
				status: true,
				evaluationInProcess: true,
				referralSource: "Physician",
			}),
		).toEqual([SECTION_ISSUE_EVALUATION_IN_PROCESS]);
	});

	it("flags active clients with no referral source, but not notes-only clients", () => {
		expect(
			getClientIssueListSections({ id: 1, status: true, referralSource: null }),
		).toEqual([SECTION_ISSUE_NO_REFERRAL_SOURCE]);
		expect(
			getClientIssueListSections({
				id: 12345,
				status: true,
				referralSource: null,
			}),
		).toEqual([]);
	});

	it("flags clients with a recurring, unresolved failure as on the drop list", () => {
		expect(
			getClientIssueListSections({
				id: 1,
				status: true,
				referralSource: "Physician",
				failures: [failure({ reason: "docs not signed", reminded: 4 })],
			}),
		).toEqual([SECTION_ISSUE_DROP_LIST]);
		expect(
			getClientIssueListSections({
				id: 1,
				status: true,
				referralSource: "Physician",
				failures: [failure({ reason: "docs not signed", reminded: 3 })],
			}),
		).toEqual([]);
		expect(
			getClientIssueListSections({
				id: 1,
				status: true,
				referralSource: "Physician",
				failures: [failure({ reason: "docs not signed", reminded: 104 })],
			}),
		).toEqual([]);
	});

	it("can match multiple issue lists at once", () => {
		expect(
			getClientIssueListSections({
				id: 1,
				status: true,
				pause: true,
				autismStop: true,
				referralSource: "Physician",
			}),
		).toEqual([SECTION_ISSUE_PAUSED, SECTION_ISSUE_AUTISM_STOP]);
	});
});

describe("getClientFailureSections", () => {
	it("returns an empty array with no failures", () => {
		expect(getClientFailureSections(undefined)).toEqual([]);
	});

	it("labels and capitalizes each unresolved failure", () => {
		expect(
			getClientFailureSections([
				failure({ reason: "portal not opened" }),
				failure({ reason: "docs not signed" }),
			]),
		).toEqual(["Failure: Portal not opened", "Failure: Docs not signed"]);
	});

	it("excludes resolved failures", () => {
		expect(
			getClientFailureSections([
				failure({ reason: "portal not opened", reminded: 100 }),
			]),
		).toEqual([]);
	});
});

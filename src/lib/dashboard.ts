import { format } from "date-fns";
import type { Client, Failure, FullClientInfo } from "./models";

export const SECTION_ACTIVE_NOT_ON_PUNCHLIST = "Active and Not On Punchlist";
export const SECTION_JUST_ADDED = "Just Added/Other";
export const SECTION_MULTIPLE_FILTERS = "Clients in Multiple Filters";
export const SECTION_DA_QS_DONE = "DA Qs Done";
export const SECTION_EVAL_QS_DONE = "Eval Qs Done";
export const SECTION_DAEVAL_QS_DONE = "DA+Eval Qs Done";
export const SECTION_NEEDS_OUTREACH = "Needs Outreach";
export const SECTION_REACHED_OUT_NEEDS_REVIEW = "Reached Out - Needs Review";
export const SECTION_RECORDS_NEEDED_NOT_REQUESTED =
	"Records Needed - Not Requested";
export const SECTION_RECORDS_REQUESTED_NOT_RETURNED =
	"Records Requested - Not Returned";
export const SECTION_INACTIVE_ON_PUNCHLIST = "Inactive and On Punchlist";
export const SECTION_DA_SCHEDULED = "DA Scheduled";
export const SECTION_EVAL_SCHEDULED = "Eval Scheduled";
export const SECTION_POST_DA = "Post-DA";
export const SECTION_POST_EVAL = "Post-Eval";
export const SECTION_NEEDS_PROTOCOLS_SCANNED = "Needs protocols scanned";

export type DashboardClient = (FullClientInfo | Client) & {
	matchedSections?: string[];
	extraInfo?: string;
	failures?: Failure[];
};

const isRecordsReady = (client: FullClientInfo) =>
	client.recordsNeeded === "Not Needed" ||
	(client.recordsNeeded === "Needed" && !!client.hasExternalRecordsNote);

const isDateString = (val: string | undefined | null) =>
	!!val && !Number.isNaN(Date.parse(val));

const formatScheduledDate = (val: string | undefined | null) => {
	if (!val || !isDateString(val)) return val ?? undefined;
	return format(new Date(val), "MM/dd/yy");
};

const isPastDate = (val: string | undefined | null) => {
	if (!val) return false;
	const parsed = Date.parse(val);
	return !Number.isNaN(parsed) && parsed < Date.now();
};

const getMinReminded = (client: FullClientInfo): number => {
	if (!client.questionnaires?.length) return 0;
	return Math.min(...client.questionnaires.map((q) => q.reminded ?? 0));
};

const sentExtraInfo = (client: FullClientInfo) => {
	const Qs = client.questionnaires;
	if (!Qs || Qs.length === 0) return "Sent on punch, no Qs in EMR";
	return `Reminded: ${getMinReminded(client)}`;
};

const sortByRemindersDesc = (a: FullClientInfo, b: FullClientInfo) => {
	const aHasQs = !!a.questionnaires?.length;
	const bHasQs = !!b.questionnaires?.length;
	if (!aHasQs && !bHasQs) return 0;
	if (!aHasQs) return -1;
	if (!bHasQs) return 1;
	return getMinReminded(b) - getMinReminded(a);
};

const getPunchClientIds = (punchClients: FullClientInfo[] | undefined) => {
	return new Set(
		punchClients
			?.map((c) => c["Client ID"])
			.filter((id): id is string => typeof id === "string" && id.trim() !== "")
			.map((id) => parseInt(id, 10))
			.filter((id) => !Number.isNaN(id)) ?? [],
	);
};

export const DASHBOARD_CONFIG: {
	title: string;
	subheading?: string;
	description?: string;
	filter: (client: FullClientInfo) => boolean;
	failureFilter?: (failure: Failure) => boolean;
	extraInfo?: (client: FullClientInfo) => string | undefined;
	sort?: (a: FullClientInfo, b: FullClientInfo) => number;
}[] = [
	{
		title: "Records Status Not Set",
		subheading: "Records",
		description:
			"Records status has not been set for these clients. Determine whether school records are needed to move forward.",
		filter: (client: FullClientInfo) =>
			!client.recordsNeeded &&
			!(
				client.babyNetERNeeded === true && client.babyNetERDownloaded === false
			),
	},
	{
		title: SECTION_RECORDS_NEEDED_NOT_REQUESTED,
		description:
			"Clients who need school records but they haven't been requested from the school district yet. To move forward, request records (record the records requested date).",
		filter: (client: FullClientInfo) =>
			client.recordsNeeded === "Needed" && !client.externalRecordsRequestedDate,
		failureFilter: (f) =>
			f.daEval === "Records" ||
			f.reason === "docs not signed" ||
			f.reason === "portal not opened",
		sort: (a, b) => {
			const hasVisibleFailure = (c: FullClientInfo) =>
				c.failures?.some(
					(f) =>
						(f.reminded ?? 0) < 100 &&
						(f.reason === "docs not signed" ||
							f.reason === "portal not opened"),
				)
					? 1
					: 0;
			return hasVisibleFailure(a) - hasVisibleFailure(b);
		},
	},
	{
		title: SECTION_RECORDS_REQUESTED_NOT_RETURNED,
		description:
			"Records have been requested but we haven't received them or noted them as returned yet. To move forward, enter records notes.",
		filter: (client: FullClientInfo) =>
			client.recordsNeeded === "Needed" &&
			!!client.externalRecordsRequestedDate &&
			!client.hasExternalRecordsNote,
		failureFilter: (f) => f.daEval === "Records",
	},
	{
		title: "BabyNet Eval Needed - Not Downloaded",
		description:
			"BabyNet eval is marked needed but hasn't been downloaded. To move forward, download it (mark BabyNet eval downloaded).",
		filter: (client: FullClientInfo) =>
			client.babyNetERNeeded === true && client.babyNetERDownloaded === false,
	},
	{
		title: "Qs Not Determined",
		subheading: "Questionnaires",
		description:
			"Records are ready and BabyNet is handled, but questionnaire needs haven't been determined. Mark DA Qs Needed and/or EVAL Qs Needed on the prioritization sheet.",
		filter: (client: FullClientInfo) =>
			isRecordsReady(client) &&
			!(
				client.babyNetERNeeded === true && client.babyNetERDownloaded === false
			) &&
			client["DA Qs Needed"] !== "TRUE" &&
			client["EVAL Qs Needed"] !== "TRUE" &&
			client["DA Qs Sent"] !== "TRUE" &&
			client["EVAL Qs Sent"] !== "TRUE" &&
			client["DA Qs Done"] !== "TRUE" &&
			client["EVAL Qs Done"] !== "TRUE" &&
			!isDateString(client["DA Scheduled"]) &&
			client["DA Scheduled"] !== "TRUE" &&
			!isDateString(client["EVAL date"]),
	},
	{
		title: "DA Qs Pending",
		description:
			"DA questionnaires are marked needed, but haven't been sent. To move forward, send them (mark DA Qs Sent on the prioritization sheet).",
		filter: (client: FullClientInfo) =>
			isRecordsReady(client) &&
			client["DA Qs Needed"] === "TRUE" &&
			client["DA Qs Sent"] === "FALSE" &&
			client["EVAL Qs Needed"] === "FALSE",
		failureFilter: (f) => f.daEval === "DA",
	},
	{
		title: "DA Qs Sent",
		description:
			"DA  questionnaires have been sent, but not finished. To move forward, the client must finish them (DA Qs Done must be marked on the prioritization sheet).",
		filter: (client: FullClientInfo) =>
			client["DA Qs Sent"] === "TRUE" &&
			client["DA Qs Done"] !== "TRUE" &&
			!(client["EVAL Qs Sent"] === "TRUE" && client["EVAL Qs Done"] !== "TRUE"),
		extraInfo: sentExtraInfo,
		failureFilter: (f) => f.daEval === "DA",
		sort: sortByRemindersDesc,
	},
	{
		title: SECTION_DA_QS_DONE,
		description:
			"DA questionnaires are finished. To move forward, schedule the DA (DA Scheduled on the prioritization sheet must be a date or checked off).",
		filter: (client: FullClientInfo) =>
			client["DA Qs Done"] === "TRUE" &&
			!isDateString(client["DA Scheduled"]) &&
			client["DA Scheduled"] !== "TRUE" &&
			client["EVAL Qs Needed"] !== "TRUE" &&
			client["EVAL Qs Sent"] !== "TRUE" &&
			client["EVAL Qs Done"] !== "TRUE" &&
			!isDateString(client["EVAL date"]),
	},
	{
		title: "Eval Qs Pending",
		description:
			"Evaluation questionnaires are marked needed, but haven't been sent. To move forward, send them (mark EVAL Qs Sent on the prioritization sheet).",
		filter: (client: FullClientInfo) =>
			isRecordsReady(client) &&
			client["EVAL Qs Needed"] === "TRUE" &&
			client["EVAL Qs Sent"] === "FALSE" &&
			client["DA Qs Sent"] === "TRUE",
		failureFilter: (f) => f.daEval === "EVAL",
	},
	{
		title: "DA+Eval Qs Pending",
		description:
			"Both DA and Evaluation questionnaires are marked needed, but haven't been sent. To move forward, send them (mark DA Qs Sent and EVAL Qs Sent on the prioritization sheet).",
		filter: (client: FullClientInfo) =>
			isRecordsReady(client) &&
			client["DA Qs Needed"] === "TRUE" &&
			client["DA Qs Sent"] === "FALSE" &&
			client["EVAL Qs Needed"] === "TRUE" &&
			client["EVAL Qs Sent"] === "FALSE",
		failureFilter: (f) => f.daEval === "DAEVAL",
	},
	{
		title: "Eval Qs Sent",
		description:
			"Evaluation questionnaires have been sent, but not finished. To move forward, the client must finish them (EVAL Qs Done must be marked on the prioritization sheet).",
		filter: (client: FullClientInfo) =>
			client["EVAL Qs Sent"] === "TRUE" &&
			client["EVAL Qs Done"] !== "TRUE" &&
			!(client["DA Qs Sent"] === "TRUE" && client["DA Qs Done"] !== "TRUE"),
		extraInfo: sentExtraInfo,
		failureFilter: (f) => f.daEval === "EVAL",
		sort: sortByRemindersDesc,
	},
	{
		title: "DA+Eval Qs Sent",
		description:
			"Both DA and Evaluation questionnaires have been sent, but not finished. To move forward, the client must finish them (DA Qs Done and EVAL Qs Done must be marked on the prioritization sheet).",
		filter: (client: FullClientInfo) =>
			client["DA Qs Sent"] === "TRUE" &&
			client["DA Qs Done"] !== "TRUE" &&
			client["EVAL Qs Sent"] === "TRUE" &&
			client["EVAL Qs Done"] !== "TRUE",
		extraInfo: sentExtraInfo,
		failureFilter: (f) => f.daEval === "DAEVAL",
		sort: sortByRemindersDesc,
	},
	{
		title: SECTION_EVAL_QS_DONE,
		description:
			"Evaluation questionnaires are finished. To move forward, schedule the eval (EVAL date on the prioritization sheet must be a date or checked off).",
		filter: (client: FullClientInfo) =>
			client["EVAL Qs Done"] === "TRUE" &&
			!isDateString(client["EVAL date"]) &&
			!(
				client["DA Qs Done"] === "TRUE" &&
				!isDateString(client["DA Scheduled"]) &&
				client["DA Scheduled"] !== "TRUE"
			),
	},
	{
		title: SECTION_DAEVAL_QS_DONE,
		description:
			"Both DA and Evaluation questionnaires are finished. To move forward, schedule the appointment (DA Scheduled and EVAL date on the prioritization sheet must be a date or checked off).",
		filter: (client: FullClientInfo) =>
			client["DA Qs Done"] === "TRUE" &&
			!isDateString(client["DA Scheduled"]) &&
			client["DA Scheduled"] !== "TRUE" &&
			client["EVAL Qs Done"] === "TRUE" &&
			!isDateString(client["EVAL date"]),
	},
	{
		title: SECTION_DA_SCHEDULED,
		subheading: "Scheduled",
		description:
			"DA appointment has been scheduled and either hasn't happened yet or \"DA Scheduled\" isn't a date. Determine next steps, eval questionnaires may need to be sent.",
		filter: (client: FullClientInfo) =>
			((isDateString(client["DA Scheduled"]) &&
				!isPastDate(client["DA Scheduled"])) ||
				client["DA Scheduled"] === "TRUE") &&
			client["EVAL Qs Needed"] !== "TRUE" &&
			client["EVAL Qs Sent"] !== "TRUE" &&
			client["EVAL Qs Done"] !== "TRUE" &&
			!isDateString(client["EVAL date"]),
		extraInfo: (client) => formatScheduledDate(client["DA Scheduled"]),
		sort: (a, b) => {
			const aDate = Date.parse(a["DA Scheduled"] ?? "");
			const bDate = Date.parse(b["DA Scheduled"] ?? "");
			if (Number.isNaN(aDate) && Number.isNaN(bDate)) return 0;
			if (Number.isNaN(aDate)) return -1;
			if (Number.isNaN(bDate)) return 1;
			return aDate - bDate;
		},
	},
	{
		title: SECTION_POST_DA,
		description:
			"DA appointment date has passed. Update the prioritization sheet with next steps.",
		filter: (client: FullClientInfo) =>
			isPastDate(client["DA Scheduled"]) &&
			client["EVAL Qs Needed"] !== "TRUE" &&
			client["EVAL Qs Sent"] !== "TRUE" &&
			client["EVAL Qs Done"] !== "TRUE" &&
			!isDateString(client["EVAL date"]),
		extraInfo: (client) => formatScheduledDate(client["DA Scheduled"]),
		sort: (a, b) =>
			Date.parse(a["DA Scheduled"] ?? "") - Date.parse(b["DA Scheduled"] ?? ""),
	},
	{
		title: SECTION_EVAL_SCHEDULED,
		description: "Eval appointment has been scheduled and hasn't happened yet.",
		filter: (client: FullClientInfo) =>
			isDateString(client["EVAL date"]) && !isPastDate(client["EVAL date"]),
		extraInfo: (client) => formatScheduledDate(client["EVAL date"]),
		sort: (a, b) =>
			Date.parse(a["EVAL date"] ?? "") - Date.parse(b["EVAL date"] ?? ""),
	},
	{
		title: SECTION_POST_EVAL,
		description: "Eval appointment date has passed.",
		filter: (client: FullClientInfo) => isPastDate(client["EVAL date"]),
		extraInfo: (client) => formatScheduledDate(client["EVAL date"]),
		sort: (a, b) =>
			Date.parse(a["EVAL date"] ?? "") - Date.parse(b["EVAL date"] ?? ""),
	},
	{
		title: SECTION_NEEDS_PROTOCOLS_SCANNED,
		description:
			"These clients have a past 96130 appointment but protocols have not been marked as scanned.",
		filter: (client: FullClientInfo) =>
			client.hasPast96130Appt === true &&
			client["Protocols scanned?"] !== "TRUE",
	},
];

export interface DashboardSection {
	title: string;
	clients: DashboardClient[];
	subheading?: string;
	description?: string;
}

export function getDashboardSections(
	punchClients: FullClientInfo[] | undefined,
	missingFromPunchlist: Client[] | undefined,
	needsReachOut: Client[] | undefined,
	needsReview: Client[] | undefined,
): DashboardSection[] {
	const punchClientIds = getPunchClientIds(punchClients);

	const activePunchClients = punchClients?.filter((c) => c.status !== false);
	const inactivePunchClients =
		punchClients?.filter((c) => c.status === false) ?? [];

	const referralSections: DashboardSection[] = [
		...(needsReachOut
			?.filter((c) => !punchClientIds.has(c.id))
			.map((c) => ({
				title: SECTION_NEEDS_OUTREACH,
				clients: [c] as DashboardClient[],
				description:
					"Clients marked as needing reach out. They are in TherapyAppointment but not on the prioritization sheet.",
				subheading: "Referrals",
			}))
			.slice(0, 1)
			.map((s) => ({
				...s,
				clients: needsReachOut?.filter((c) => !punchClientIds.has(c.id)) ?? [],
			})) ?? []),
		...(needsReview
			?.filter((c) => !punchClientIds.has(c.id))
			.map((c) => ({
				title: SECTION_REACHED_OUT_NEEDS_REVIEW,
				clients: [c] as DashboardClient[],
				description:
					"Clients marked for review before pushing to prioritization sheet.",
				subheading: needsReachOut?.some((c) => !punchClientIds.has(c.id))
					? undefined
					: "Referrals",
			}))
			.slice(0, 1)
			.map((s) => ({
				...s,
				clients: needsReview?.filter((c) => !punchClientIds.has(c.id)) ?? [],
			})) ?? []),
	];

	const filteredSections = DASHBOARD_CONFIG.map((config) => {
		const filtered = activePunchClients?.filter(config.filter) ?? [];
		if (config.sort) filtered.sort(config.sort);
		return {
			title: config.title,
			subheading: config.subheading,
			description: config.description,
			clients: filtered.map((client) => ({
				...client,
				failures: client.failures?.filter(
					(f) =>
						(f.reminded ?? 0) < 100 && (config.failureFilter?.(f) ?? false),
				),
				extraInfo: config.extraInfo?.(client),
			})),
		};
	});

	const justAddedSection = {
		title: SECTION_JUST_ADDED,
		clients:
			activePunchClients
				?.filter((client) =>
					DASHBOARD_CONFIG.every((config) => !config.filter(client)),
				)
				.map((client) => ({
					...client,
					failures: client.failures?.filter((f) => (f.reminded ?? 0) < 100),
				})) ?? [],
		description: "Clients who don't match any specific filter criteria yet.",
	};

	const clientMatchedSections = new Map<string, string[]>();
	for (const section of [justAddedSection, ...filteredSections]) {
		for (const client of section.clients) {
			const clientId = client["Client ID"] ?? client.id.toString();
			const sections = clientMatchedSections.get(clientId) ?? [];
			clientMatchedSections.set(clientId, [...sections, section.title]);
		}
	}

	const clientsInMultipleFilters =
		punchClients
			?.filter(
				(client) =>
					(clientMatchedSections.get(client["Client ID"] ?? "")?.length ?? 0) >
					1,
			)
			.map((client) => ({
				...client,
				matchedSections: clientMatchedSections.get(client["Client ID"] ?? ""),
				failures: client.failures?.filter(
					(f) =>
						(f.reminded ?? 0) < 100 &&
						DASHBOARD_CONFIG.some(
							(config) =>
								config.failureFilter?.(f) &&
								clientMatchedSections
									.get(client["Client ID"] ?? "")
									?.includes(config.title),
						),
				),
			})) ?? [];

	return [
		{
			title: SECTION_ACTIVE_NOT_ON_PUNCHLIST,
			clients: missingFromPunchlist ?? [],
			description:
				"Active clients who are missing from the Google Sheets Prioritization list.",
		},
		{
			title: SECTION_INACTIVE_ON_PUNCHLIST,
			clients: inactivePunchClients,
			description:
				"These clients are on the prioritization sheet but are marked inactive. They should be removed from the sheet or reactivated.",
		},
		{
			title: SECTION_MULTIPLE_FILTERS,
			clients: clientsInMultipleFilters,
			description:
				"Clients who match multiple dashboard filters simultaneously, which usually indicates data inconsistency.",
		},
		justAddedSection,
		...referralSections,
		...filteredSections,
	];
}

export function getClientMatchedSections(
	client: { id: number },
	allPunchClients: FullClientInfo[] | undefined,
	missingFromPunchlist: Client[] | undefined,
	needsReachOut: Client[] | undefined,
	needsReview: Client[] | undefined,
) {
	const matchedSections: string[] = [];
	const punchClientIds = getPunchClientIds(allPunchClients);
	const clientId = client.id;

	if (
		needsReachOut?.some((m) => m.id === clientId) &&
		!punchClientIds.has(clientId)
	) {
		matchedSections.push(SECTION_NEEDS_OUTREACH);
	}
	if (
		needsReview?.some((m) => m.id === clientId) &&
		!punchClientIds.has(clientId)
	) {
		matchedSections.push(SECTION_REACHED_OUT_NEEDS_REVIEW);
	}

	if (missingFromPunchlist?.some((m) => m.id === clientId)) {
		matchedSections.push(SECTION_ACTIVE_NOT_ON_PUNCHLIST);
	}

	const punchClient = allPunchClients?.find((p) => p.id === clientId);
	if (punchClient) {
		let matchedAnyFilter = false;
		for (const config of DASHBOARD_CONFIG) {
			if (config.filter(punchClient)) {
				matchedSections.push(config.title);
				matchedAnyFilter = true;
			}
		}
		if (!matchedAnyFilter) matchedSections.push(SECTION_JUST_ADDED);
	}

	return matchedSections;
}

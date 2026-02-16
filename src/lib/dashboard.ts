import { env } from "~/env";
import type { Client, Failure, FullClientInfo } from "./models";

export const SECTION_ACTIVE_NOT_ON_PUNCHLIST = "Active and Not On Punchlist";
export const SECTION_JUST_ADDED = "Just Added";
export const SECTION_MULTIPLE_FILTERS = "Clients in Multiple Filters";
export const SECTION_DA_QS_DONE = "DA Qs Done";
export const SECTION_EVAL_QS_DONE = "Eval Qs Done";
export const SECTION_DAEVAL_QS_DONE = "DAEVAL Qs Done";

export type DashboardClient = (FullClientInfo | Client) & {
	matchedSections?: string[];
	extraInfo?: string;
	failures?: Failure[];
};

const isDateString = (val: string | undefined | null) => {
	if (!val) return false;
	return (
		!Number.isNaN(Date.parse(val)) || /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(val)
	);
};

const sentExtraInfo = (client: FullClientInfo) => {
	const Qs = client.questionnaires;
	if (!Qs || Qs.length === 0) return `Not in ${env.NEXT_PUBLIC_APP_TITLE[0]}`;
	const minReminded = Math.min(...Qs.map((q) => q.reminded ?? 0));
	return `Reminded: ${minReminded}`;
};

export const DASHBOARD_CONFIG: {
	title: string;
	subheading?: string;
	filter: (client: FullClientInfo) => boolean;
	failureFilter?: (failure: Failure) => boolean;
	extraInfo?: (client: FullClientInfo) => string | undefined;
}[] = [
	{
		title: "Records Needed - Not Requested",
		subheading: "Records",
		filter: (client: FullClientInfo) =>
			client.recordsNeeded === "Needed" && !client.externalRecordsRequestedDate,
		failureFilter: (f) => f.daEval === "Records",
	},
	{
		title: "Records Requested - Not Returned",
		filter: (client: FullClientInfo) =>
			client.recordsNeeded === "Needed" &&
			!!client.externalRecordsRequestedDate &&
			!client.hasExternalRecordsNote,
		failureFilter: (f) => f.daEval === "Records",
	},
	{
		title: "BabyNet Eval Needed - Not Downloaded",
		filter: (client: FullClientInfo) =>
			client.babyNetERNeeded === true && client.babyNetERDownloaded === false,
	},
	{
		title: "Records Reviewed - Qs Not Sent",
		filter: (client: FullClientInfo) => {
			const isRecordsReady =
				client.recordsNeeded === "Not Needed" ||
				(client.recordsNeeded === "Needed" &&
					client.hasExternalRecordsNote === true);
			return (
				isRecordsReady &&
				((client["DA Qs Needed"] === "TRUE" &&
					client["DA Qs Sent"] === "FALSE") ||
					(client["EVAL Qs Needed"] === "TRUE" &&
						client["EVAL Qs Sent"] === "FALSE"))
			);
		},
		failureFilter: (f) =>
			f.daEval === "DA" || f.daEval === "EVAL" || f.daEval === "DAEVAL",
	},
	{
		title: "DA Qs Pending",
		subheading: "Questionnaires",
		filter: (client: FullClientInfo) => {
			const isRecordsReady =
				client.recordsNeeded === "Not Needed" ||
				(client.recordsNeeded === "Needed" &&
					client.hasExternalRecordsNote === true);
			return (
				isRecordsReady &&
				client["DA Qs Needed"] === "TRUE" &&
				client["DA Qs Sent"] === "FALSE" &&
				client["EVAL Qs Needed"] === "FALSE"
			);
		},
		failureFilter: (f) => f.daEval === "DA",
	},
	{
		title: "DA Qs Sent",
		filter: (client: FullClientInfo) =>
			client["DA Qs Sent"] === "TRUE" &&
			client["DA Qs Done"] === "FALSE" &&
			!(
				client["EVAL Qs Sent"] === "TRUE" && client["EVAL Qs Done"] === "FALSE"
			),
		extraInfo: sentExtraInfo,
		failureFilter: (f) => f.daEval === "DA",
	},
	{
		title: SECTION_DA_QS_DONE,
		filter: (client: FullClientInfo) =>
			client["DA Qs Done"] === "TRUE" &&
			!isDateString(client["DA Scheduled"]) &&
			client["DA Scheduled"] !== "TRUE" &&
			!(
				client["EVAL Qs Done"] === "TRUE" && !isDateString(client["EVAL date"])
			),
	},
	{
		title: "Eval Qs Pending",
		filter: (client: FullClientInfo) => {
			const isRecordsReady =
				client.recordsNeeded === "Not Needed" ||
				(client.recordsNeeded === "Needed" &&
					client.hasExternalRecordsNote === true);
			return (
				isRecordsReady &&
				client["EVAL Qs Needed"] === "TRUE" &&
				client["EVAL Qs Sent"] === "FALSE" &&
				client["DA Qs Sent"] === "TRUE"
			);
		},
		failureFilter: (f) => f.daEval === "EVAL",
	},
	{
		title: "DAEVAL Qs Pending",
		filter: (client: FullClientInfo) => {
			const isRecordsReady =
				client.recordsNeeded === "Not Needed" ||
				(client.recordsNeeded === "Needed" &&
					client.hasExternalRecordsNote === true);
			return (
				isRecordsReady &&
				client["DA Qs Needed"] === "TRUE" &&
				client["DA Qs Sent"] === "FALSE" &&
				client["EVAL Qs Needed"] === "TRUE" &&
				client["EVAL Qs Sent"] === "FALSE"
			);
		},
		failureFilter: (f) => f.daEval === "DAEVAL",
	},
	{
		title: "Eval Qs Sent",
		filter: (client: FullClientInfo) =>
			client["EVAL Qs Sent"] === "TRUE" &&
			client["EVAL Qs Done"] === "FALSE" &&
			!(client["DA Qs Sent"] === "TRUE" && client["DA Qs Done"] === "FALSE"),
		extraInfo: sentExtraInfo,
		failureFilter: (f) => f.daEval === "EVAL",
	},
	{
		title: "DAEVAL Qs Sent",
		filter: (client: FullClientInfo) =>
			client["DA Qs Sent"] === "TRUE" &&
			client["DA Qs Done"] === "FALSE" &&
			client["EVAL Qs Sent"] === "TRUE" &&
			client["EVAL Qs Done"] === "FALSE",
		extraInfo: sentExtraInfo,
		failureFilter: (f) => f.daEval === "DAEVAL",
	},
	{
		title: SECTION_EVAL_QS_DONE,
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
		filter: (client: FullClientInfo) =>
			client["DA Qs Done"] === "TRUE" &&
			!isDateString(client["DA Scheduled"]) &&
			client["DA Scheduled"] !== "TRUE" &&
			client["EVAL Qs Done"] === "TRUE" &&
			!isDateString(client["EVAL date"]),
	},
];

export interface DashboardSection {
	title: string;
	clients: DashboardClient[];
	subheading?: string;
}

export function getDashboardSections(
	punchClients: FullClientInfo[] | undefined,
	missingFromPunchlist: Client[] | undefined,
): DashboardSection[] {
	const filteredSections = DASHBOARD_CONFIG.map((config) => ({
		title: config.title,
		subheading: config.subheading,
		clients:
			punchClients?.filter(config.filter).map((client) => ({
				...client,
				failures: client.failures?.filter(
					(f) =>
						(f.reminded ?? 0) < 100 && (config.failureFilter?.(f) ?? false),
				),
				extraInfo: config.extraInfo?.(client),
			})) ?? [],
	}));

	const justAdded =
		punchClients
			?.filter((client) =>
				DASHBOARD_CONFIG.every((config) => !config.filter(client)),
			)
			.map((client) => ({
				...client,
				failures: client.failures?.filter((f) => (f.reminded ?? 0) < 100),
			})) ?? [];

	const allSections = [
		{ title: SECTION_JUST_ADDED, clients: justAdded },
		...filteredSections,
	];

	const clientMatchedSections = new Map<string, string[]>();
	allSections.forEach((section) => {
		section.clients.forEach((client) => {
			const clientId = client["Client ID"] ?? client.id.toString();
			const sections = clientMatchedSections.get(clientId) ?? [];
			clientMatchedSections.set(clientId, [...sections, section.title]);
		});
	});

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
				// For this specific view, we show all relevant failures from the sections they are in
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
		},
		{
			title: SECTION_MULTIPLE_FILTERS,
			clients: clientsInMultipleFilters,
		},
		...allSections,
	];
}

export function getClientMatchedSections(
	client: FullClientInfo | Client,
	allPunchClients: FullClientInfo[],
	missingFromPunchlist: { id: number }[],
) {
	const matchedSections: string[] = [];

	// Check if missing from punchlist
	if (missingFromPunchlist.some((m) => m.id === client.id)) {
		matchedSections.push(SECTION_ACTIVE_NOT_ON_PUNCHLIST);
	}

	// Check if on punchlist
	const punchClient = allPunchClients.find((p) => p.id === client.id);
	if (punchClient) {
		let matchedAnyFilter = false;
		for (const config of DASHBOARD_CONFIG) {
			if (config.filter(punchClient)) {
				matchedSections.push(config.title);
				matchedAnyFilter = true;
			}
		}

		if (!matchedAnyFilter) {
			matchedSections.push(SECTION_JUST_ADDED);
		}
	}

	return matchedSections;
}

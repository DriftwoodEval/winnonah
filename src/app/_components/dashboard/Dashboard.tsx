"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@ui/accordion";
import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { env } from "~/env";
import type { Failure, FullClientInfo } from "~/lib/models";
import { api } from "~/trpc/react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";

interface PunchListAccordionProps {
	clients: {
		hash: string;
		fullName?: string | null;
		"Client ID"?: string | null;
		"Client Name"?: string | null;
		matchedSections?: string[];
		extraInfo?: string;
		failures?: { reason: string }[];
	}[];
	title: string;
}

function PunchListAccordionItem({ clients, title }: PunchListAccordionProps) {
	return (
		<AccordionItem value={title.replace(" ", "-")}>
			<AccordionTrigger>
				<span className="flex items-center gap-1">
					{title}
					<span className="text-muted-foreground text-sm">
						({clients?.length})
					</span>
				</span>
			</AccordionTrigger>
			<AccordionContent>
				<ScrollArea className="h-[400px] w-full rounded-md border bg-card text-card-foreground shadow">
					<div className="p-4">
						{clients?.map((client, index) => (
							<div key={client.hash}>
								<Link className="block w-full" href={`/clients/${client.hash}`}>
									<div>
										<div className="flex items-center justify-between">
											<span>{client.fullName ?? client["Client Name"]}</span>
											{client.extraInfo && (
												<span className="text-muted-foreground text-xs">
													{client.extraInfo}
												</span>
											)}
										</div>
										{client.matchedSections && (
											<span className="block text-muted-foreground text-xs">
												{client.matchedSections.join(", ")}
											</span>
										)}
										{client.failures && client.failures.length > 0 && (
											<div className="mt-1">
												{client.failures.map((failure) => (
													<span
														className="mr-1 inline-block rounded-sm bg-destructive/10 px-1 py-0.5 text-[10px] text-destructive"
														key={failure.reason}
													>
														{failure.reason}
													</span>
												))}
											</div>
										)}
									</div>
								</Link>
								{index < clients.length - 1 && <Separator className="my-2" />}
							</div>
						))}
					</div>
				</ScrollArea>
			</AccordionContent>
		</AccordionItem>
	);
}

export function Dashboard() {
	const {
		data: clients,
		isLoading: isLoadingPunch,
		isError: isErrorPunch,
	} = api.google.getPunch.useQuery(undefined, {
		refetchInterval: 30000, // 30 seconds
	});

	const {
		data: missingFromPunchlist,
		isLoading: isLoadingMissing,
		isError: isErrorMissing,
	} = api.google.getMissingFromPunchlist.useQuery(undefined, {
		refetchInterval: 30000, // 30 seconds
	});

	const isLoading = isLoadingPunch || isLoadingMissing;
	const isError = isErrorPunch || isErrorMissing;

	const DASHBOARD_CONFIG: {
		title: string;
		filter: (client: FullClientInfo) => boolean;
		failureFilter?: (failure: Failure) => boolean;
		extraInfo?: (client: FullClientInfo) => string | undefined;
	}[] = [
		{
			title: "Records Needed - Not Requested",
			filter: (client: FullClientInfo) =>
				client.recordsNeeded === "Needed" &&
				!client.externalRecordsRequestedDate,
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
			title: "BabyNet ER Needed - Not Downloaded",
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
			failureFilter: (f) => f.daEval === "DA" || f.daEval === "EVAL",
		},
		{
			title: "DA Qs Pending",
			filter: (client: FullClientInfo) => {
				const isRecordsReady =
					client.recordsNeeded === "Not Needed" ||
					(client.recordsNeeded === "Needed" &&
						client.hasExternalRecordsNote === true);
				return (
					isRecordsReady &&
					client["DA Qs Needed"] === "TRUE" &&
					client["DA Qs Sent"] === "FALSE"
				);
			},
			failureFilter: (f) => f.daEval === "DA" || f.daEval === "DAEVAL",
		},
		{
			title: "DA Qs Sent",
			filter: (client: FullClientInfo) =>
				client["DA Qs Sent"] === "TRUE" && client["DA Qs Done"] === "FALSE",
			extraInfo: (client) => {
				const Qs = client.questionnaires;
				if (!Qs || Qs.length === 0)
					return `Not in ${env.NEXT_PUBLIC_APP_TITLE[0]}`;
				const minReminded = Math.min(...Qs.map((q) => q.reminded ?? 0));
				return `Reminded: ${minReminded}`;
			},
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
					client["EVAL Qs Sent"] === "FALSE"
				);
			},
			failureFilter: (f) => f.daEval === "EVAL" || f.daEval === "DAEVAL",
		},
		{
			title: "Eval Qs Sent",
			filter: (client: FullClientInfo) =>
				client["EVAL Qs Sent"] === "TRUE" && client["EVAL Qs Done"] === "FALSE",
			extraInfo: (client) => {
				const Qs = client.questionnaires;
				if (!Qs || Qs.length === 0)
					return `Not in ${env.NEXT_PUBLIC_APP_TITLE[0]}`;
				const minReminded = Math.min(...Qs.map((q) => q.reminded ?? 0));
				return `Reminded: ${minReminded}`;
			},
		},
	];

	const filteredSections = DASHBOARD_CONFIG.map((config) => ({
		title: config.title,
		clients:
			clients?.filter(config.filter).map((client) => ({
				...client,
				failures: client.failures?.filter(
					(f) =>
						(f.reminded ?? 0) < 100 && (config.failureFilter?.(f) ?? false),
				),
				extraInfo: config.extraInfo?.(client),
			})) ?? [],
	}));

	const justAdded =
		clients
			?.filter((client) =>
				DASHBOARD_CONFIG.every((config) => !config.filter(client)),
			)
			.map((client) => ({
				...client,
				failures: client.failures?.filter((f) => (f.reminded ?? 0) < 100),
			})) ?? [];

	const allSections = [
		{ title: "Just Added", clients: justAdded },
		...filteredSections,
	];

	const clientMatchedSections = new Map<string, string[]>();
	allSections.forEach((section) => {
		section.clients.forEach((client) => {
			const clientId = client["Client ID"] ?? "";
			const sections = clientMatchedSections.get(clientId) ?? [];
			clientMatchedSections.set(clientId, [...sections, section.title]);
		});
	});

	const clientsInMultipleFilters =
		clients
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

	const finalSections = [
		...allSections,
		{
			title: "Active and Not On Punchlist",
			clients: missingFromPunchlist ?? [],
		},
		{
			title: "Clients in Multiple Filters",
			clients: clientsInMultipleFilters,
		},
	];

	if (isLoading)
		return (
			<div className="mx-4 mt-8 flex grow flex-col items-center">
				<Skeleton className="h-[400px] w-full bg-muted md:w-1/2" />
			</div>
		);

	if (isError)
		return (
			<div className="mx-4 mt-8 flex grow flex-col items-center">Error</div>
		);

	return (
		<div className="mx-4 mt-8 flex grow flex-col items-center">
			<Accordion className="w-full md:w-1/2" type="multiple">
				<Alert className="mb-4">
					<FlaskConical />
					<AlertTitle>Beta</AlertTitle>
					<AlertDescription>
						Double-check that data is accurate, we're still working on this.
					</AlertDescription>
				</Alert>

				<p className="text-muted-foreground text-sm">
					Punchlist: {clients?.length}
				</p>

				{finalSections.map((section) => (
					<PunchListAccordionItem
						clients={section.clients}
						key={section.title}
						title={section.title}
					/>
				))}
			</Accordion>
		</div>
	);
}

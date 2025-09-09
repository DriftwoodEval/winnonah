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
import Link from "next/link";
import type { FullClientInfo as MergedPunchClient } from "~/lib/types";
import { api } from "~/trpc/react";

interface PunchListAccordionProps {
	clients: MergedPunchClient[];
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
							<div key={client["Client ID"]}>
								<Link className="block w-full" href={`/clients/${client.hash}`}>
									{client.fullName ?? client["Client Name"]}
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

export default function Dashboard() {
	const {
		data: clients,
		isLoading,
		isError,
	} = api.google.getPunch.useQuery(undefined, {
		refetchInterval: 30000, // 30 seconds
	});

	const justAdded = clients?.filter(
		(client) =>
			client["DA Qs Needed"] === "FALSE" &&
			client["DA Qs Sent"] === "FALSE" &&
			client["DA Qs Done"] === "FALSE" &&
			client["DA Scheduled"] === "FALSE" &&
			client["EVAL Qs Sent"] === "FALSE" &&
			client["EVAL Qs Done"] === "FALSE" &&
			client["EVAL Qs Needed"] === "FALSE",
	);

	const daQsPending = clients?.filter(
		(client) =>
			client["DA Qs Needed"] === "TRUE" && client["DA Qs Sent"] === "FALSE",
	);

	const daQsSent = clients?.filter(
		(client) =>
			client["DA Qs Sent"] === "TRUE" && client["DA Qs Done"] === "FALSE",
	);

	const daQsDone = clients?.filter(
		(client) =>
			client["DA Qs Done"] === "TRUE" && client["EVAL Qs Needed"] === "FALSE",
	);

	const daScheduled = clients?.filter(
		(client) =>
			/^(TRUE|[0-9]+\/[0-9]+)$/.test(client["DA Scheduled"] ?? "") &&
			client["PA Requested? (Aetna, ADHD,BabyNet, Molina, PP-N/A)"] === "FALSE",
	);

	// const paRequested = clients?.filter(
	// 	(client) =>
	// 		client["PA Requested? (Aetna, ADHD,BabyNet, Molina, PP-N/A)"] !==
	// 			"FALSE" && client["EVAL Qs Needed"] === "FALSE",
	// );

	const evalQsPending = clients?.filter(
		(client) =>
			client["EVAL Qs Needed"] === "TRUE" && client["EVAL Qs Sent"] === "FALSE",
	);

	const evalQsSent = clients?.filter(
		(client) =>
			client["EVAL Qs Sent"] === "TRUE" && client["EVAL Qs Done"] === "FALSE",
	);

	const evalQsDone = clients?.filter(
		(client) =>
			client["EVAL Qs Done"] === "TRUE" &&
			(client["EVAL date"] === undefined || client["EVAL date"] === ""),
	);

	const evalScheduled = clients?.filter(
		(client) => new Date(client["EVAL date"] ?? "") > new Date(),
	);

	const needsProtocolsScanned = clients?.filter(
		(client) =>
			client["Protocols scanned?"] === "FALSE" &&
			new Date(client["EVAL date"] ?? "") < new Date(),
	);

	const allFilteredLists = [
		justAdded,
		daQsPending,
		daQsSent,
		daQsDone,
		daScheduled,
		// paRequested,
		evalQsPending,
		evalQsSent,
		evalQsDone,
		evalScheduled,
		needsProtocolsScanned,
	];

	const clientCounts = new Map<string, number>();

	allFilteredLists.forEach((list) => {
		list?.forEach((client) => {
			const clientId = client["Client ID"] ?? "";
			clientCounts.set(clientId, (clientCounts.get(clientId) || 0) + 1);
		});
	});

	const clientsInMultipleFilters: MergedPunchClient[] = [];

	clients?.forEach((client) => {
		const clientId = client["Client ID"] ?? "";
		if ((clientCounts.get(clientId) ?? 0) > 1) {
			clientsInMultipleFilters.push(client);
		}
	});

	if (isLoading)
		return (
			<div className="mx-4 flex flex-grow items-center justify-center">
				<Skeleton className="h-1/2 w-full bg-muted md:w-1/2" />
			</div>
		);

	if (isError)
		return (
			<div className="mx-4 flex flex-grow items-center justify-center">
				Error
			</div>
		);

	return (
		<div className="mx-4 flex flex-grow items-center justify-center">
			<Accordion className="md:w-1/2" type="multiple">
				<PunchListAccordionItem clients={justAdded ?? []} title="Just Added" />
				<PunchListAccordionItem
					clients={daQsPending ?? []}
					title="DA Qs Pending"
				/>
				<PunchListAccordionItem clients={daQsSent ?? []} title="DA Qs Sent" />
				<PunchListAccordionItem
					clients={daQsDone ?? []}
					title="DA Ready to Schedule"
				/>
				<PunchListAccordionItem
					clients={daScheduled ?? []}
					title="DA Scheduled"
				/>
				{/* <PunchListAccordionItem
					clients={paRequested ?? []}
					title="PA Requested"
				/> */}
				<PunchListAccordionItem
					clients={evalQsPending ?? []}
					title="Eval Qs Pending"
				/>
				<PunchListAccordionItem
					clients={evalQsSent ?? []}
					title="Eval Qs Sent"
				/>
				<PunchListAccordionItem
					clients={evalQsDone ?? []}
					title="Eval Ready to Schedule"
				/>
				<PunchListAccordionItem
					clients={evalScheduled ?? []}
					title="Eval Scheduled"
				/>
				<PunchListAccordionItem
					clients={needsProtocolsScanned ?? []}
					title="Needs Protocols Scanned"
				/>
				<PunchListAccordionItem
					clients={clientsInMultipleFilters ?? []}
					title="Clients in Multiple Filters"
				/>
			</Accordion>
		</div>
	);
}

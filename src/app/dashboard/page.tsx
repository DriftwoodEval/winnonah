"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@ui/accordion";
import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import Link from "next/link";
import type { PunchClient } from "~/lib/types";
import { api } from "~/trpc/react";

interface PunchClientListProps {
	clients: PunchClient[];
}

interface PunchListAccordionProps {
	clients: PunchClient[];
	title: string;
}

function PunchClientList({ clients }: PunchClientListProps) {
	return (
		<ScrollArea className="h-[400px] w-full rounded-md border bg-card text-card-foreground shadow">
			<div className="p-4">
				<h4 className="mb-4 font-medium text-muted-foreground text-sm leading-none">
					Showing {clients?.length} Client
					{clients?.length === 1 ? "" : "s"}
				</h4>

				{clients?.map((client, index) => (
					<div key={client["Client ID"]}>
						<Link className="block w-full" href={`/clients/${client.hash}`}>
							{client["Client Name"]}
						</Link>
						{index < clients.length - 1 && <Separator className="my-2" />}
					</div>
				))}
			</div>
		</ScrollArea>
	);
}

function PunchListAccordionItem({ clients, title }: PunchListAccordionProps) {
	return (
		<AccordionItem value={title.replace(" ", "-")}>
			<AccordionTrigger>{title}</AccordionTrigger>
			<AccordionContent>
				<PunchClientList clients={clients} />
			</AccordionContent>
		</AccordionItem>
	);
}

export default function Dashboard() {
	const { data: clients } = api.google.getPunch.useQuery(undefined, {
		refetchInterval: 30000, // 30 seconds
	});

	const justAdded = clients?.filter(
		(client) =>
			client["DA Qs Needed"] === "FALSE" &&
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

	const paRequested = clients?.filter(
		(client) =>
			client["PA Requested? (Aetna, ADHD,BabyNet, Molina, PP-N/A)"] !==
				"FALSE" && client["EVAL Qs Needed"] === "FALSE",
	);

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
			!/^(TRUE|[0-9]+\/[0-9]+)$/.test(client["EVAL date"] ?? ""),
	);

	const evalScheduled = clients?.filter(
		(client) =>
			// Check if it is in the future
			new Date(client["EVAL date"] ?? "") > new Date(),
	);

	const needsProtocolsScanned = clients?.filter(
		// Check if it is in the past and protocols not scanned
		(client) =>
			client["Protocols scanned?"] === "FALSE" &&
			new Date(client["EVAL date"] ?? "") < new Date(),
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
				<PunchListAccordionItem
					clients={paRequested ?? []}
					title="PA Requested"
				/>
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
			</Accordion>
		</div>
	);
}

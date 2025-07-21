"use client";
import Link from "next/link";
import type { Client } from "~/server/lib/types";
import { api } from "~/trpc/react";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";

interface IssueListProps {
	title: string;
	clients: Client[];
}

const IssueList = ({ title, clients }: IssueListProps) => (
	<div>
		<ScrollArea className="dark w-full rounded-md border bg-card text-card-foreground">
			<div className="p-4">
				<h1 className="mb-4 font-bold text-lg leading-none">{title}</h1>
				{clients.map((client, index) => (
					<Link href={`/clients/${client.hash}`} key={client.hash}>
						<div key={client.hash} className="text-sm">
							{client.fullName}
						</div>
						{index !== clients.length - 1 && (
							<Separator key="separator" className="my-2" />
						)}
					</Link>
				))}
			</div>
		</ScrollArea>
	</div>
);

export function IssuesList() {
	const asanaErrorsResponse = api.clients.getAsanaErrors.useQuery();
	const asanaErrors = asanaErrorsResponse.data;

	const districtErrorsResponse = api.clients.getDistrictErrors.useQuery();
	const districtErrors = districtErrorsResponse.data;

	const archivedAsanaErrorsResponse =
		api.clients.getArchivedAsanaErrors.useQuery();
	const archivedAsanaErrors = archivedAsanaErrorsResponse.data;

	const babyNetErrorsResponse = api.clients.getBabyNetErrors.useQuery();
	const babyNetErrors = babyNetErrorsResponse.data;

	return (
		<div className="flex flex-wrap gap-6">
			{asanaErrors && asanaErrors.length !== 0 && (
				<IssueList title="Missing Asana IDs" clients={asanaErrors} />
			)}
			{districtErrors && districtErrors.length !== 0 && (
				<IssueList title="Missing Districts" clients={districtErrors} />
			)}
			{archivedAsanaErrors && archivedAsanaErrors.length !== 0 && (
				<IssueList
					title="Archived in Asana, Active in TA"
					clients={archivedAsanaErrors}
				/>
			)}
			{babyNetErrors && babyNetErrors.length !== 0 && (
				<IssueList title="Too Old for BabyNet" clients={babyNetErrors} />
			)}
		</div>
	);
}

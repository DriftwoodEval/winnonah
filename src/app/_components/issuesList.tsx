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
						<div className="text-sm" key={client.hash}>
							{client.fullName}
						</div>
						{index !== clients.length - 1 && (
							<Separator className="my-2" key="separator" />
						)}
					</Link>
				))}
			</div>
		</ScrollArea>
	</div>
);

export function IssuesList() {
	const { data: asanaErrors } = api.clients.getAsanaErrors.useQuery();
	const { data: districtErrors } = api.clients.getDistrictErrors.useQuery();
	const { data: archivedAsanaErrors } =
		api.clients.getArchivedAsanaErrors.useQuery();
	const { data: babyNetErrors } = api.clients.getBabyNetErrors.useQuery();
	const { data: notInTAErrors } = api.clients.getNotInTAErrors.useQuery();

	return (
		<div className="flex flex-wrap gap-6">
			{asanaErrors && asanaErrors.length !== 0 && (
				<IssueList clients={asanaErrors} title="Missing Asana IDs" />
			)}
			{districtErrors && districtErrors.length !== 0 && (
				<IssueList clients={districtErrors} title="Missing Districts" />
			)}
			{archivedAsanaErrors && archivedAsanaErrors.length !== 0 && (
				<IssueList
					clients={archivedAsanaErrors}
					title="Archived in Asana, Active in TA"
				/>
			)}
			{babyNetErrors && babyNetErrors.length !== 0 && (
				<IssueList clients={babyNetErrors} title="Too Old for BabyNet" />
			)}
			{notInTAErrors && notInTAErrors.length !== 0 && (
				<IssueList clients={notInTAErrors} title="Not in TA" />
			)}
		</div>
	);
}

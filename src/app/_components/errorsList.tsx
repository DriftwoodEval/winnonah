"use client";
import Link from "next/link";
import { api } from "~/trpc/react";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";

export function ErrorsList() {
	const asanaErrorsResponse = api.clients.getAsanaErrors.useQuery();
	const asanaErrors = asanaErrorsResponse.data;

	const districtErrorsResponse = api.clients.getDistrictErrors.useQuery();
	const districtErrors = districtErrorsResponse.data;

	return (
		<div className="flex flex-wrap gap-6">
			{/* TODO: Link to clients in edit mode */}
			{asanaErrors && asanaErrors.length !== 0 && (
				<div>
					<ScrollArea className="dark w-full rounded-md border bg-card text-card-foreground">
						<div className="p-4">
							<h1 className="mb-4 font-bold text-lg leading-none">
								Missing Asana IDs
							</h1>
							{asanaErrors.map((client) => (
								<Link href={`/clients/${client.hash}`} key={client.hash}>
									<div key={client.hash} className="text-sm">
										{client.fullName}
									</div>
									<Separator key="separator" className="my-2" />
								</Link>
							))}
						</div>
					</ScrollArea>
				</div>
			)}
			{districtErrors && districtErrors.length !== 0 && (
				<div>
					<ScrollArea className="dark w-full rounded-md border bg-card text-card-foreground">
						<div className="p-4">
							<h1 className="mb-4 font-bold text-lg leading-none">
								Missing Districts
							</h1>
							{districtErrors.map((client) => (
								<Link href={`/clients/${client.hash}`} key={client.hash}>
									<div key={client.hash} className="text-sm">
										{client.fullName}
									</div>
									<Separator key="separator" className="my-2" />
								</Link>
							))}
						</div>
					</ScrollArea>
				</div>
			)}
		</div>
	);
}

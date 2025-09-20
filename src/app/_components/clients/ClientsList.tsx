"use client";

import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import { Plus, X } from "lucide-react";
import type { SortedClient } from "~/server/lib/types";
import { api } from "~/trpc/react";
import { ClientListItem } from "./ClientListItem";

interface ClientsListProps {
	clients: SortedClient[];
	highlightedIndex: number;
	savedPlace?: string;
}
export function ClientsList({
	clients,
	highlightedIndex,
	savedPlace,
}: ClientsListProps) {
	const utils = api.useUtils();
	const { data: savedPlaces } = api.users.getSavedPlaces.useQuery();
	const savedPlaceHash = savedPlaces?.[savedPlace || ""] || "";

	const { mutate: updateSavedPlaces } = api.users.updateSavedPlaces.useMutation(
		{
			onSuccess: () => {
				utils.users.getSavedPlaces.invalidate();
			},
		},
	);

	const { mutate: deleteSavedPlace } = api.users.deleteSavedPlace.useMutation({
		onSuccess: () => {
			utils.users.getSavedPlaces.invalidate();
		},
	});

	const isSavedClient = (clientHash: string) => {
		return savedPlace && savedPlaceHash === clientHash;
	};

	if (clients.length === 0) {
		return (
			<div className="flex h-[400px] w-full items-center justify-center rounded-md border border-dashed">
				<div className="text-center">
					<h3 className="font-semibold text-lg">No Clients Found</h3>
					<p className="text-muted-foreground text-sm">
						Try adjusting your search or filters.
					</p>
				</div>
			</div>
		);
	}

	return (
		<ScrollArea className="h-[400px] w-full rounded-md border bg-card text-card-foreground shadow">
			<div className="p-4">
				<h4 className="mb-4 font-medium text-muted-foreground text-sm leading-none">
					Showing {clients.length} Client{clients.length === 1 ? "" : "s"}
				</h4>

				{clients.map((client, index) => (
					<div key={client.hash}>
						<ClientListItem
							client={client}
							isHighlighted={index === highlightedIndex}
						/>
						{isSavedClient(client.hash) && (
							// biome-ignore lint/a11y/useSemanticElements: rescaping button styling. should probably fix later. TODO
							<div
								aria-label={`Remove ${client.fullName} as saved client for ${savedPlace}`}
								className="group relative flex cursor-pointer items-center py-2"
								onClick={() => {
									if (savedPlace) {
										deleteSavedPlace({ key: savedPlace });
									}
								}}
								onKeyUp={(event) => {
									if (event.key === "Enter" && savedPlace) {
										deleteSavedPlace({ key: savedPlace });
									}
								}}
								role="button"
								tabIndex={0}
							>
								<Separator className="my-2 flex-1 rounded bg-primary data-[orientation=horizontal]:h-1" />
								<div className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute top-1/2 left-1/2 rounded-full bg-primary px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
									<X className="h-4 w-4" />
								</div>
							</div>
						)}
						{index < clients.length - 1 &&
							savedPlace &&
							!isSavedClient(client.hash) && (
								// biome-ignore lint/a11y/useSemanticElements: escaping button styling. should probably fix later. TODO
								<div
									aria-label={`Set ${client.fullName} as saved client for ${savedPlace}`}
									className="group relative flex cursor-pointer items-center py-2"
									onClick={() => {
										updateSavedPlaces({
											key: savedPlace,
											hash: client.hash,
										});
									}}
									onKeyUp={(event) => {
										if (event.key === "Enter") {
											updateSavedPlaces({
												key: savedPlace,
												hash: client.hash,
											});
										}
									}}
									role="button"
									tabIndex={0}
								>
									<Separator className="flex-1" />
									<div className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute top-1/2 left-1/2 rounded-full bg-muted px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
										<Plus className="h-4 w-4" />
									</div>
								</div>
							)}
						{index < clients.length - 1 && !savedPlace && (
							<Separator className="my-2" />
						)}
					</div>
				))}
			</div>
		</ScrollArea>
	);
}

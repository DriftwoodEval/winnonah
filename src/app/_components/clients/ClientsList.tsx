"use client";

import { Button } from "@ui/button";
import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import { MapIcon, Pin, PinOff } from "lucide-react";
import { useEffect, useRef } from "react";
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
	const savedClientRef = useRef<HTMLDivElement>(null);
	const { data: savedPlaces } = api.users.getSavedPlaces.useQuery();

	const savedPlaceData = savedPlaces?.[savedPlace || ""];
	const savedPlaceHash = savedPlaceData?.hash;
	const savedPlaceIndex = savedPlaceData?.index;

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

	useEffect(() => {
		if (!savedPlace || !savedPlaceHash || clients.length === 0) return;

		const savedClientIndex = clients.findIndex(
			(client) => client.hash === savedPlaceHash,
		);

		if (savedClientIndex === -1) {
			const fallbackIndex =
				savedPlaceIndex !== undefined
					? Math.min(savedPlaceIndex - 1, clients.length - 1)
					: 0;

			if (clients[fallbackIndex]) {
				updateSavedPlaces({
					key: savedPlace,
					hash: clients[fallbackIndex].hash,
					index: fallbackIndex,
				});
			}
		}
	}, [clients, savedPlace, savedPlaceHash, savedPlaceIndex, updateSavedPlaces]);

	const isSavedClient = (clientHash: string) => {
		return savedPlace && savedPlaceHash === clientHash;
	};

	const scrollToSavedClient = () => {
		if (savedClientRef.current) {
			savedClientRef.current.scrollIntoView({
				behavior: "smooth",
			});
		}
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
				<div className="mb-2 flex min-h-8 items-center justify-between">
					<h4 className="font-medium text-muted-foreground text-sm leading-none">
						Showing {clients.length} Client{clients.length === 1 ? "" : "s"}
					</h4>
					{savedPlaceHash && (
						<Button
							aria-label="Scroll to saved client"
							className="font-medium text-muted-foreground text-xs"
							onClick={scrollToSavedClient}
							size="sm"
							type="button"
							variant="ghost"
						>
							<MapIcon className="h-3 w-3" />
							Go to saved
						</Button>
					)}
				</div>

				{clients.map((client, index) => (
					<div
						key={client.hash}
						ref={isSavedClient(client.hash) ? savedClientRef : null}
					>
						<ClientListItem
							client={client}
							isHighlighted={index === highlightedIndex}
						/>
						{isSavedClient(client.hash) && (
							<button
								aria-label={`Remove ${client.fullName} as saved client for ${savedPlace}`}
								className="group relative flex w-full cursor-pointer items-center py-2"
								onClick={() => {
									if (savedPlace) {
										deleteSavedPlace({ key: savedPlace });
									}
								}}
								type="button"
							>
								<Separator className="my-2 flex-1 rounded bg-accent data-[orientation=horizontal]:h-1" />
								<div className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute top-1/2 left-1/2 rounded-full bg-accent px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100">
									<PinOff className="h-4 w-4" />
								</div>
							</button>
						)}
						{index < clients.length - 1 &&
							savedPlace &&
							!isSavedClient(client.hash) && (
								<button
									aria-label={`Set ${client.fullName} as saved client for ${savedPlace}`}
									className="group relative flex w-full cursor-pointer items-center py-2"
									onClick={() => {
										updateSavedPlaces({
											key: savedPlace,
											hash: client.hash,
											index,
										});
									}}
									type="button"
								>
									<Separator className="flex-1" />
									<div className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute top-1/2 left-1/2 rounded-full bg-muted px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100">
										<Pin className="h-4 w-4" />
									</div>
								</button>
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

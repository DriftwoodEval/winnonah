"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@ui/button";
import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import { MapIcon, Pin, PinOff } from "lucide-react";
import { useEffect, useRef } from "react";
import type { SortedClient } from "~/lib/api-types";
import { api } from "~/trpc/react";
import { ClientListItem } from "./ClientListItem";

interface ClientsListProps {
	clients: SortedClient[];
	highlightedIndex: number;
	savedPlace?: string;
	heightClass?: string;
}

export function ClientsList({
	clients,
	highlightedIndex,
	savedPlace,
	heightClass = "h-[calc(100dvh-8rem)]",
}: ClientsListProps) {
	const utils = api.useUtils();
	const viewportRef = useRef<HTMLDivElement>(null);
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

	// Only mounts the rows near the viewport - client search/directory-style
	// lists can run to hundreds of results, each row with several DOM nodes.
	const rowVirtualizer = useVirtualizer({
		count: clients.length,
		getScrollElement: () => viewportRef.current,
		estimateSize: () => 48,
		overscan: 10,
	});

	// Scrolls by index via the virtualizer instead of a DOM ref, since the
	// highlighted/saved row may not be mounted.
	// biome-ignore lint/correctness/useExhaustiveDependencies: rowVirtualizer is not a stable reference across renders and would refire this every render
	useEffect(() => {
		if (highlightedIndex === -1) return;
		rowVirtualizer.scrollToIndex(highlightedIndex, {
			align: "center",
			behavior: "smooth",
		});
	}, [highlightedIndex]);

	const scrollToSavedClient = () => {
		if (!savedPlaceHash) return;
		const index = clients.findIndex((c) => c.hash === savedPlaceHash);
		if (index === -1) return;
		rowVirtualizer.scrollToIndex(index, {
			align: "center",
			behavior: "smooth",
		});
	};

	if (clients.length === 0) {
		return (
			<div
				className={`flex ${heightClass} w-full items-center justify-center rounded-md border border-dashed`}
			>
				<div className="text-center">
					<h3 className="font-semibold text-lg">No Clients Found</h3>
					<p className="text-muted-foreground text-sm">
						Try adjusting your search or filters.
					</p>
				</div>
			</div>
		);
	}

	const virtualItems = rowVirtualizer.getVirtualItems();

	return (
		<ScrollArea
			className={`${heightClass} w-full rounded-md border bg-card text-card-foreground shadow`}
			viewportRef={viewportRef}
		>
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

				<div
					style={{
						position: "relative",
						height: rowVirtualizer.getTotalSize(),
					}}
				>
					{virtualItems.map((virtualRow) => {
						const client = clients[virtualRow.index];
						if (!client) return null;
						const index = virtualRow.index;

						return (
							<div
								className="bg-card"
								data-index={index}
								key={client.hash}
								ref={rowVirtualizer.measureElement}
								style={{
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									transform: `translateY(${virtualRow.start}px)`,
								}}
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
										<Separator className="my-2 flex-1 rounded bg-secondary data-[orientation=horizontal]:h-1" />
										<div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100">
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
											<div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100">
												<Pin className="h-4 w-4" />
											</div>
										</button>
									)}
								{index < clients.length - 1 && !savedPlace && (
									<Separator className="my-2" />
								)}
							</div>
						);
					})}
				</div>
			</div>
		</ScrollArea>
	);
}

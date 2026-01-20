// src/components/SelectableClientsList.tsx

"use client";

import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import { useEffect, useRef } from "react";
import type { SortedClient } from "~/lib/api-types";
import { SelectableClientListItem } from "./SelectableClientListItem";

interface SelectableClientsListProps {
	clients: SortedClient[];
	onSelectionChange: (selectedClient: SortedClient | null) => void;
	selectedClient?: SortedClient | null;
	showId?: boolean;
}

export function SelectableClientsList({
	clients,
	onSelectionChange,
	selectedClient,
	showId = true,
}: SelectableClientsListProps) {
	const selectedRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (selectedClient && selectedRef.current) {
			selectedRef.current.scrollIntoView({
				behavior: "smooth",
				block: "center",
			});
		}
	}, [selectedClient]);

	if (clients.length === 0) {
		return (
			<div className="flex h-[400px] w-full items-center justify-center rounded-md border border-dashed">
				<div className="text-center">
					<h3 className="font-semibold text-lg">No Clients Found</h3>
					<p className="text-muted-foreground text-sm">
						Try adjusting your search.
					</p>
				</div>
			</div>
		);
	}

	const handleSelect = (client: SortedClient) => {
		// If the same client is clicked, deselect it (set to null), otherwise select the new client.
		const newSelection = selectedClient?.hash === client.hash ? null : client;
		onSelectionChange(newSelection);
	};

	return (
		<ScrollArea className="h-[400px] w-full rounded-md border bg-card text-card-foreground shadow">
			<div className="p-4">
				<h4 className="mb-4 font-medium text-muted-foreground text-sm leading-none">
					Showing {clients.length} Client{clients.length === 1 ? "" : "s"}
				</h4>
				{clients.map((client, index) => (
					<div key={client.hash}>
						<SelectableClientListItem
							client={client}
							isSelected={selectedClient?.hash === client.hash}
							onSelect={handleSelect}
							ref={selectedClient?.hash === client.hash ? selectedRef : null}
							showId={showId}
						/>
						{index < clients.length - 1 && <Separator className="my-2" />}
					</div>
				))}
			</div>
		</ScrollArea>
	);
}

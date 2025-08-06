"use client";

import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import type { SortedClient } from "~/server/lib/types";
import { ClientListItem } from "./ClientListItem";

interface ClientsListProps {
	clients: SortedClient[];
}
export function ClientsList({ clients }: ClientsListProps) {
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
		<ScrollArea className="dark h-[400px] w-full rounded-md border bg-card text-card-foreground">
			<div className="p-4">
				<h4 className="mb-4 font-medium text-muted-foreground text-sm leading-none">
					Showing {clients.length} Client{clients.length === 1 ? "" : "s"}
				</h4>

				{clients.map((client, index) => (
					<div key={client.hash}>
						<ClientListItem client={client} />
						{index < clients.length - 1 && <Separator className="my-2" />}
					</div>
				))}
			</div>
		</ScrollArea>
	);
}

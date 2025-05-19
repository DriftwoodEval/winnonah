"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { ScrollArea } from "~/app/_components/ui/scroll-area";
import { Separator } from "~/app/_components/ui/separator";
import { api } from "~/trpc/react";

export function Clients() {
	const clients = api.clients.getAll.useQuery();

	const searchParams = useSearchParams();

	let filteredClients = clients.data ?? [];

	if (searchParams.get("eval") != null) {
		const evalClients = api.clients.getByNpi.useQuery(
			searchParams.get("eval") as string,
		);
		if (evalClients.data) {
			filteredClients = evalClients.data.map((client) => client.client);
		}
	}

	if (searchParams.get("office")) {
		filteredClients = filteredClients.filter(
			(client) => client.closestOffice === searchParams.get("office"),
		);
	}

	const utils = api.useUtils();
	const [name, setName] = useState("");

	return (
		<ScrollArea className="dark h-72 w-96 rounded-md border bg-card text-card-foreground">
			<div className="p-4">
				<h4 className="mb-4 font-medium text-sm leading-none">Clients</h4>
				{filteredClients.map((client) => (
					<div key={client.id}>
						<div key={client.id} className="text-sm">
							{client.firstname}{" "}
							{client.preferredName ? `(${client.preferredName})` : ""}{" "}
							{client.lastname}
						</div>
						<Separator key="separator" className="my-2" />
					</div>
				))}
			</div>
		</ScrollArea>
	);
}

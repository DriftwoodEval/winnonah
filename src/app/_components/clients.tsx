"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Input } from "~/app/_components/ui/input";
import { ScrollArea } from "~/app/_components/ui/scroll-area";
import { Separator } from "~/app/_components/ui/separator";
import { api } from "~/trpc/react";

export function Clients() {
	const clients = api.clients.getSorted.useQuery();

	const searchParams = useSearchParams();
	const [searchInput, setSearchInput] = useState("");

	let initiallyFilteredClients = clients.data ?? [];

	if (searchParams.get("eval") != null) {
		const evalParam = searchParams.get("eval") ?? "";
		const evalNumber = Number.parseInt(evalParam, 10);

		if (!Number.isNaN(evalNumber)) {
			const evalClients = api.clients.getByNpi.useQuery(evalNumber);
			if (evalClients.data) {
				initiallyFilteredClients = evalClients.data;
			}
		}
	}

	if (searchParams.get("office")) {
		initiallyFilteredClients = initiallyFilteredClients.filter(
			(client) => client.closestOffice === searchParams.get("office"),
		);
	}

	const filteredClients = useMemo(() => {
		if (!searchInput) return initiallyFilteredClients;

		return initiallyFilteredClients.filter((client) => {
			return client.fullName?.toLowerCase().includes(searchInput.toLowerCase());
		});
	}, [initiallyFilteredClients, searchInput]);

	return (
		<div className="flex flex-col gap-3">
			<Input
				placeholder="Search by name"
				value={searchInput}
				onChange={(e) => setSearchInput(e.target.value)}
			/>
			<ScrollArea className="dark h-72 w-full rounded-md border bg-card text-card-foreground">
				<div className="p-4">
					<h4 className="mb-4 font-medium text-sm leading-none">Clients</h4>

					{filteredClients.map((client) => (
						<Link href={`/clients/${client.hash}`} key={client.id}>
							<div key={client.id}>
								<div key={client.id} className="text-sm">
									{client.fullName}
								</div>
								<Separator key="separator" className="my-2" />
							</div>
						</Link>
					))}
				</div>
			</ScrollArea>
		</div>
	);
}

"use client";

import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "~/trpc/react";

function useDebounce<T>(value: T, delay: number): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);
	useEffect(() => {
		const handler = setTimeout(() => {
			setDebouncedValue(value);
		}, delay);
		return () => {
			clearTimeout(handler);
		};
	}, [value, delay]);
	return debouncedValue;
}

export function AddClientToScheduling({
	onClientAdded,
}: {
	onClientAdded: () => void;
}) {
	const [searchTerm, setSearchTerm] = useState("");
	const debouncedSearchTerm = useDebounce(searchTerm, 500);

	const { data: searchResults, isFetching } = api.clients.search.useQuery(
		{ nameSearch: debouncedSearchTerm },
		{ enabled: debouncedSearchTerm.length >= 3 },
	);
	const { data: scheduledData } = api.scheduling.get.useQuery();

	const scheduledClientIds = useMemo(() => {
		return new Set(scheduledData?.clients.map((c) => c.clientId));
	}, [scheduledData]);

	const addClientMutation = api.scheduling.add.useMutation({
		onSuccess: () => {
			onClientAdded();
			setSearchTerm("");
		},
	});

	const clients = useMemo(() => {
		return searchResults?.clients.filter((c) => !scheduledClientIds.has(c.id)) || [];
	}, [searchResults, scheduledClientIds]);

	return (
		<div className="max-w-md space-y-4">
			<div className="relative">
				<Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
				<Input
					className="pl-10"
					onChange={(e) => setSearchTerm(e.target.value)}
					placeholder="Search for a client to add..."
					value={searchTerm}
				/>
			</div>

			{isFetching && (
				<div className="flex items-center justify-center p-4">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
				</div>
			)}

			{!isFetching && clients.length > 0 && (
				<ul className="max-h-60 overflow-y-auto rounded-md border">
					{clients.map((client) => (
						<li
							className="flex items-center justify-between border-b p-2 last:border-b-0"
							key={client.id}
						>
							<span>{client.fullName}</span>
							<Button
								disabled={addClientMutation.isPending}
								onClick={() =>
									addClientMutation.mutate({ clientId: client.id })
								}
								size="sm"
							>
								Add
							</Button>
						</li>
					))}
				</ul>
			)}

			{!isFetching &&
				clients.length === 0 &&
				debouncedSearchTerm.length >= 3 && (
					<p className="p-4 text-center text-muted-foreground text-sm">
						No clients found.
					</p>
				)}
		</div>
	);
}

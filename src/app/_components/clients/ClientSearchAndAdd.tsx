"use client";

import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SortedClient } from "~/lib/api-types";
import { cn } from "~/lib/utils";
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

interface ClientSearchAndAddProps {
	onAdd: (client: SortedClient) => void;
	excludeIds?: number[];
	placeholder?: string;
	addButtonLabel?: string;
	isAdding?: boolean;
	resetOnAdd?: boolean;
	initialSearchTerm?: string;
}

export function ClientSearchAndAdd({
	onAdd,
	excludeIds,
	placeholder = "Search for a client...",
	addButtonLabel = "Add",
	isAdding = false,
	resetOnAdd = false,
	initialSearchTerm = "",
}: ClientSearchAndAddProps) {
	const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
	const debouncedSearchTerm = useDebounce(searchTerm, 500);

	const { data: searchResults, isFetching } = api.clients.search.useQuery(
		{
			nameSearch: debouncedSearchTerm,
			excludeIds,
		},
		{
			enabled: debouncedSearchTerm.length >= 3,
			placeholderData: (previousData) => previousData,
		},
	);

	const clients = useMemo(() => {
		return (searchResults?.clients as SortedClient[]) || [];
	}, [searchResults]);

	const handleAdd = (client: SortedClient) => {
		onAdd(client);
		if (resetOnAdd) {
			setSearchTerm("");
		}
	};

	return (
		<div className="w-full space-y-4">
			<div className="relative">
				<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					className="pl-10"
					onChange={(e) => setSearchTerm(e.target.value)}
					placeholder={placeholder}
					value={searchTerm}
				/>
			</div>

			{isFetching && clients.length === 0 && (
				<div className="flex items-center justify-center p-4">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
				</div>
			)}

			{clients.length > 0 && (
				<ul
					className={cn(
						"max-h-60 overflow-y-auto rounded-md border bg-background transition-opacity",
						isFetching && "pointer-events-none opacity-50",
					)}
				>
					{clients.map((client) => (
						<li
							className="flex items-center justify-between border-b p-2 last:border-b-0"
							key={client.id}
						>
							<div className="flex flex-col">
								<span className="font-medium text-sm">{client.fullName}</span>
								{client.id.toString().length !== 5 && (
									<span className="text-muted-foreground text-xs">
										ID: {client.id}
									</span>
								)}
							</div>
							<Button
								disabled={isAdding || isFetching}
								onClick={() => handleAdd(client)}
								size="sm"
							>
								{addButtonLabel}
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

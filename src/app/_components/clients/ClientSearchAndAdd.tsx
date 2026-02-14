"use client";

import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui/tooltip";
import { Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SortedClient } from "~/lib/api-types";
import { cn, isShellClientId } from "~/lib/utils";
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
	floating?: boolean;
}

export function ClientSearchAndAdd({
	onAdd,
	excludeIds,
	placeholder = "Search for a client...",
	addButtonLabel = "Add",
	isAdding = false,
	resetOnAdd = false,
	initialSearchTerm = "",
	floating = false,
}: ClientSearchAndAddProps) {
	const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
	const [isFocused, setIsFocused] = useState(false);
	const debouncedSearchTerm = useDebounce(searchTerm, 500);

	const { data: searchResults, isFetching } = api.clients.search.useQuery(
		{
			nameSearch: debouncedSearchTerm,
			excludeIds,
		},
		{
			enabled: debouncedSearchTerm.length >= 3,
		},
	);

	const clients = useMemo(() => {
		if (searchTerm.length < 3) return [];
		return (searchResults?.clients as SortedClient[]) || [];
	}, [searchResults, searchTerm]);

	const handleAdd = (client: SortedClient) => {
		onAdd(client);
		if (resetOnAdd) {
			setSearchTerm("");
		}
	};

	const showResults =
		(!floating || isFocused) &&
		(clients.length > 0 ||
			(isFetching && searchTerm.length >= 3) ||
			(!isFetching &&
				clients.length === 0 &&
				debouncedSearchTerm.length >= 3 &&
				searchTerm.length >= 3));

	const showTooltip =
		searchTerm.length > 0 && searchTerm.length < 3 && !isFocused;

	return (
		<search
			className={cn("relative w-full", !floating && "space-y-4")}
			onBlur={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget)) {
					setIsFocused(false);
				}
			}}
			onFocus={() => setIsFocused(true)}
		>
			<div className="relative">
				<Tooltip open={showTooltip}>
					<TooltipTrigger asChild>
						<div>
							<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								aria-invalid={showTooltip}
								className="pl-10"
								onChange={(e) => setSearchTerm(e.target.value)}
								placeholder={placeholder}
								value={searchTerm}
							/>
						</div>
					</TooltipTrigger>
					<TooltipContent
						arrowClassName="bg-destructive fill-destructive"
						className="bg-destructive text-destructive-foreground"
					>
						Enter at least 3 characters
					</TooltipContent>
				</Tooltip>
			</div>

			{showResults && (
				<div
					className={cn(
						"mt-1 overflow-y-auto rounded-md border bg-background",
						floating
							? "absolute top-full right-0 left-0 z-50 max-h-60 shadow-lg"
							: "max-h-[350px] w-full",
					)}
				>
					{isFetching && clients.length === 0 && searchTerm.length >= 3 && (
						<div className="flex items-center justify-center p-4">
							<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
						</div>
					)}

					{clients.length > 0 && (
						<ul
							className={cn(
								"transition-opacity",
								isFetching && "pointer-events-none opacity-50",
							)}
						>
							{clients.map((client) => (
								<li
									className="flex items-center justify-between border-b p-2 last:border-b-0"
									key={client.id}
								>
									<div className="flex flex-col">
										<span className="font-medium text-sm">
											{client.fullName}
										</span>
										{!isShellClientId(client.id) && (
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
						debouncedSearchTerm.length >= 3 &&
						searchTerm.length >= 3 && (
							<p className="p-4 text-center text-muted-foreground text-sm">
								No clients found.
							</p>
						)}
				</div>
			)}
		</search>
	);
}

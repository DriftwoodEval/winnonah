"use client";

import { Button } from "@ui/button";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@ui/command";
import { Spinner } from "@ui/spinner";
import { debounce } from "lodash";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getHexFromColor } from "~/lib/colors";
import { cn, formatClientAge } from "~/lib/utils";
import type { SortedClient } from "~/server/lib/types";
import { api } from "~/trpc/react";

export function GlobalClientSearch() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [searchInput, setSearchInput] = useState("");
	const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
	const [osKey, setOsKey] = useState("Ctrl");

	const debouncedQueryUpdate = useCallback(
		debounce((value: string) => {
			setDebouncedSearchTerm(value.trim());
		}, 300),
		[],
	);

	const handleValueChange = (value: string) => {
		setSearchInput(value);
		debouncedQueryUpdate(value);
	};

	const { data: SearchQuery, isLoading } = api.clients.search.useQuery(
		{ nameSearch: debouncedSearchTerm },
		{
			enabled: debouncedSearchTerm.length >= 3 && open,
		},
	);

	const clients = SearchQuery?.clients;

	useEffect(() => {
		if (navigator.userAgent.includes("Mac")) {
			setOsKey("⌘");
		}
	}, []);

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((currentOpen) => !currentOpen);
			}
		};

		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, []);

	const handleSelectClient = (client: SortedClient) => {
		router.push(`/clients/${client.hash}`);
		setOpen(false);
	};

	useEffect(() => {
		if (!open) {
			setSearchInput("");
			setDebouncedSearchTerm("");
		}
	}, [open]);

	const showSpinner = isLoading;

	return (
		<>
			<Button
				className="flex h-9 w-auto items-center gap-2 px-2"
				onClick={() => setOpen(true)}
				variant="ghost"
			>
				<Search className="h-4 w-4 text-muted-foreground" />
				<kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded px-1.5 font-medium font-mono text-[10px] text-muted-foreground opacity-100 lg:inline-flex">
					<span className="text-xs">{osKey}</span>K
				</kbd>
			</Button>

			<CommandDialog onOpenChange={setOpen} open={open}>
				<CommandInput
					onValueChange={handleValueChange}
					placeholder="Type a client name..."
					value={searchInput}
				/>

				<CommandList className="relative h-[300px] overflow-y-auto transition-opacity">
					{showSpinner && (
						<div className="absolute inset-0 z-10 flex items-center justify-center">
							<Spinner />
						</div>
					)}

					<CommandEmpty>
						{isLoading
							? null
							: debouncedSearchTerm.length > 0 && debouncedSearchTerm.length < 3
								? "Please enter 3 or more characters."
								: debouncedSearchTerm.length >= 3
									? "No clients found."
									: "Start typing to search for a client."}
					</CommandEmpty>

					{clients && clients.length > 0 && (
						// BUG: Sometimes doesn't display when only one client would be returned based on ID?
						<CommandGroup>
							{clients.map((client) => {
								const clientHexColor = client.color
									? getHexFromColor(client.color)
									: undefined;

								return (
									<CommandItem
										// className="[&[data-selected]]:bg-accent/50"
										key={client.hash}
										onSelect={() => handleSelectClient(client)}
										value={`${client.fullName} ${client.hash}`}
									>
										<div className="flex w-full justify-between text-sm">
											<div className="flex items-center gap-2">
												{client.color && clientHexColor && (
													<span
														className="h-3 w-3 shrink-0 rounded-full"
														style={{ backgroundColor: clientHexColor }}
													/>
												)}
												<span>{client.fullName}</span>
											</div>
											<span
												className={cn(
													"text-muted-foreground text-xs",
													(client.sortReason === "BabyNet above 2:6" ||
														client.sortReason === "High Priority") &&
														"text-destructive",
												)}
											>
												<span className="font-bold text-muted-foreground">
													{client.interpreter ? "Interpreter " : ""}
												</span>
												{client.sortReason === "BabyNet above 2:6"
													? `BabyNet: ${formatClientAge(new Date(client.dob), "short")}`
													: client.sortReason === "Added date"
														? `Added: ${client.addedDate?.toLocaleDateString(
																"en-US",
																{
																	year: "numeric",
																	month: "short",
																	day: "numeric",
																	timeZone: "UTC",
																},
															)}`
														: client.sortReason}
											</span>
										</div>
									</CommandItem>
								);
							})}
						</CommandGroup>
					)}
				</CommandList>
			</CommandDialog>
		</>
	);
}

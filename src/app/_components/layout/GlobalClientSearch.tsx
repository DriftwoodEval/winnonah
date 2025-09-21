"use client";

import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogHeader } from "@ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Skeleton } from "@ui/skeleton";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "~/trpc/react";
import { ClientsList } from "../clients/ClientsList";
import { NameSearchInput } from "../clients/NameSearchInput";

export function GlobalClientSearch() {
	const router = useRouter();

	const [open, setOpen] = useState(false);
	const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
	const [statusFilter, setStatusFilter] = useState("active");
	const [highlightedIndex, setHighlightedIndex] = useState(-1);
	const [osKey, setOsKey] = useState("Ctrl");

	const queryParams = useMemo(() => {
		const status = statusFilter;
		const finalSearchTerm =
			debouncedSearchTerm.length >= 3 ? debouncedSearchTerm : undefined;
		return {
			nameSearch: finalSearchTerm,
			status: status as "active" | "inactive" | "all",
		};
	}, [debouncedSearchTerm, statusFilter]);

	const {
		data: searchQuery,
		isLoading,
		isPlaceholderData,
	} = api.clients.search.useQuery(queryParams, {
		enabled: open,
		placeholderData: (previousData) => previousData,
	});

	const clients = searchQuery?.clients;

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!clients?.length) return;

			if (event.key === "ArrowDown") {
				event.preventDefault();
				setHighlightedIndex((prevIndex) => (prevIndex + 1) % clients.length);
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				setHighlightedIndex(
					(prevIndex) => (prevIndex - 1 + clients.length) % clients.length,
				);
			} else if (event.key === "Enter") {
				event.preventDefault();
				if (highlightedIndex !== -1 && clients?.[highlightedIndex]) {
					const client = clients[highlightedIndex];
					router.push(`/clients/${client.hash}`);
				}
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [clients, highlightedIndex, router]);

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

	return (
		<>
			<Button
				className="flex h-9 w-auto items-center gap-2 border-none bg-transparent px-2 shadow-none hover:bg-transparent"
				onClick={() => setOpen(true)}
			>
				<Search className="h-4 w-4 text-muted-foreground" />
				<div className="flex gap-1">
					<kbd className="pointer-events-none flex h-5 select-none items-center justify-center gap-1 rounded-sm border bg-background px-1 font-sans text-[0.7rem] text-muted-foreground">
						{osKey}
					</kbd>
					<kbd className="pointer-events-none flex aspect-square h-5 select-none items-center justify-center gap-1 rounded-sm border bg-background px-1 font-sans text-[0.7rem] text-muted-foreground">
						K
					</kbd>
				</div>
			</Button>

			<Dialog onOpenChange={setOpen} open={open}>
				<DialogContent>
					<DialogHeader></DialogHeader>
					<div className="flex gap-2">
						<NameSearchInput
							debounceMs={300}
							initialValue={""}
							onDebouncedChange={(name) => {
								setDebouncedSearchTerm(name);
								setHighlightedIndex(-1);
							}}
						/>
						<Select defaultValue="active" onValueChange={setStatusFilter}>
							<SelectTrigger>
								<SelectValue placeholder="Status" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="active">Active</SelectItem>
								<SelectItem value="inactive">Inactive</SelectItem>
								<SelectItem value="all">All</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div
						className={
							isPlaceholderData
								? "opacity-60 transition-opacity duration-200"
								: "opacity-100 transition-opacity duration-200"
						}
					>
						{isLoading ? (
							<Skeleton className="h-[400px] w-full bg-muted" />
						) : (
							<ClientsList
								clients={clients ?? []}
								highlightedIndex={highlightedIndex}
							/>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

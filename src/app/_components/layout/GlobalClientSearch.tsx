"use client";

import { Button } from "@ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@ui/dialog";
import { Kbd, KbdGroup } from "@ui/kbd";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { Skeleton } from "@ui/skeleton";
import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "~/trpc/react";
import { ClientsList } from "../clients/ClientsList";
import { NameSearchInput } from "../clients/NameSearchInput";

export function GlobalClientSearch() {
	const router = useRouter();
	const pathname = usePathname();
	const { data: session } = useSession();

	const [open, setOpen] = useState(false);
	const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
	const [statusFilter, setStatusFilter] = useState("active");
	const [highlightedIndex, setHighlightedIndex] = useState(-1);
	const [osKey, setOsKey] = useState("Ctrl");

	const highlightedItemRef = useRef<HTMLDivElement>(null);

	// Fetch saved filters from the session
	const { data: savedFiltersData } = api.sessions.getClientFilters.useQuery(
		undefined,
		{
			enabled: !!session,
		},
	);

	// Mutation to save filters to the session
	const saveFiltersMutation = api.sessions.saveClientFilters.useMutation();

	const savedFilters = useMemo(() => {
		try {
			return savedFiltersData?.clientFilters
				? JSON.parse(savedFiltersData.clientFilters)
				: {};
		} catch {
			return {};
		}
	}, [savedFiltersData?.clientFilters]);

	// Initialize and sync status filter from saved filters
	useEffect(() => {
		if (session) {
			setStatusFilter(savedFilters.status ?? "active");
		}
	}, [savedFilters.status, session]);

	const handleStatusChange = (newStatus: string) => {
		setStatusFilter(newStatus);
		if (!session) return;

		const filtersToSave = { ...savedFilters };
		if (newStatus !== "active") {
			filtersToSave.status = newStatus;
		} else {
			delete filtersToSave.status;
		}

		const newFiltersString = JSON.stringify(filtersToSave);

		if (newFiltersString !== (savedFiltersData?.clientFilters ?? "{}")) {
			saveFiltersMutation.mutate({ clientFilters: newFiltersString });
		}
	};

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
		if (highlightedIndex !== -1 && highlightedItemRef.current) {
			highlightedItemRef.current.scrollIntoView({
				behavior: "smooth",
				block: "center",
			});
		}
	}, [highlightedIndex]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!clients?.length || !open) return;

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
	}, [clients, open, highlightedIndex, router]);

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

	// biome-ignore lint/correctness/useExhaustiveDependencies: We want to reset the open state when the path changes, although we don't care what the path changes to.
	useEffect(() => {
		setOpen(false);
	}, [pathname]);

	return (
		<>
			<Button
				className="flex h-9 w-auto cursor-pointer items-center gap-2 border-none bg-transparent px-2 shadow-none hover:bg-transparent"
				onClick={() => setOpen(true)}
			>
				<Search className="h-4 w-4 text-muted-foreground" />
				<KbdGroup>
					<Kbd>{osKey} + K</Kbd>
				</KbdGroup>
			</Button>

			<Dialog onOpenChange={setOpen} open={open}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="sr-only">Search Clients</DialogTitle>
					</DialogHeader>
					<div className="flex gap-2">
						<NameSearchInput
							debounceMs={300}
							initialValue={""}
							onDebouncedChange={(name) => {
								setDebouncedSearchTerm(name);
								setHighlightedIndex(-1);
							}}
						/>
						<Select onValueChange={handleStatusChange} value={statusFilter}>
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
								highlightedItemRef={highlightedItemRef}
							/>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

"use client";
import { ArrowLeft, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { NameSearchInput } from "~/app/_components/clients/NameSearchInput";
import { SelectableClientsList } from "~/app/_components/clients/SelectableClientsList";
import { Button } from "~/app/_components/ui/button";
import { Skeleton } from "~/app/_components/ui/skeleton";
import type { SortedClient } from "~/server/lib/types";
import { api } from "~/trpc/react";
import { Client } from "../client/Client";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";

export function Merge() {
	const utils = api.useUtils();
	const [
		debouncedNameForImportedClientsQuery,
		setDebouncedNameForImportedClientsQuery,
	] = useState("");

	const [debouncedNameForNotesQuery, setDebouncedNameForNotesQuery] =
		useState("");

	const finalImportedClientsNameSearch = useMemo(
		() =>
			debouncedNameForImportedClientsQuery.length >= 3
				? debouncedNameForImportedClientsQuery
				: undefined,
		[debouncedNameForImportedClientsQuery],
	);

	const finalNotesNameSearch = useMemo(
		() =>
			debouncedNameForNotesQuery.length >= 3
				? debouncedNameForNotesQuery
				: undefined,
		[debouncedNameForNotesQuery],
	);

	const {
		data: importedClientsQuery,
		isLoading: isLoadingImportedClients,
		isPlaceholderData: isPlaceholderImportedClients,
	} = api.clients.search.useQuery(
		{ nameSearch: finalImportedClientsNameSearch },
		{
			// The `placeholderData` option keeps the old data on screen while new data is fetched.
			placeholderData: (previousData) => previousData,
		},
	);

	const {
		data: notesQuery,
		isLoading: isLoadingNotes,
		isPlaceholderData: isPlaceholderNotes,
	} = api.clients.search.useQuery(
		{ nameSearch: finalNotesNameSearch, type: "note" },
		{
			// The `placeholderData` option keeps the old data on screen while new data is fetched.
			placeholderData: (previousData) => previousData,
		},
	);

	const clients = importedClientsQuery?.clients;
	const [selectedClient, setSelectedClient] = useState<SortedClient | null>(
		null,
	);

	const notes = notesQuery?.clients;

	const [selectedNote, setSelectedNote] = useState<SortedClient | null>(null);

	const [mergeDialogOpen, setMergeDialogOpen] = useState(false);

	const { mutate: replaceNotes } = api.clients.replaceNotes.useMutation({
		onSuccess: () => {
			setMergeDialogOpen(false);
			utils.clients.search.invalidate({ type: "note" });
		},
		onError: (error) => {
			toast.error("Failed to replace notes", {
				description: String(error.message),
			});
		},
	});

	return (
		<div className="mx-4 flex w-full flex-col items-center justify-center gap-4 lg:flex-row lg:gap-8">
			<div className="flex w-full flex-col gap-3 lg:w-1/3">
				<h2 className="font-semibold text-xl">Imported Clients</h2>
				<NameSearchInput
					debounceMs={300}
					initialValue={""}
					onDebouncedChange={(name) => {
						setDebouncedNameForImportedClientsQuery(name);
					}}
				/>
				{isLoadingImportedClients ? (
					<Skeleton className="h-[400px] w-full" />
				) : (
					<div
						className={
							isPlaceholderImportedClients
								? "opacity-60 transition-opacity duration-200"
								: "opacity-100 transition-opacity duration-200"
						}
					>
						<SelectableClientsList
							clients={clients ?? []}
							onSelectionChange={setSelectedClient}
							selectedClient={selectedClient}
						/>
					</div>
				)}
			</div>

			<Dialog onOpenChange={setMergeDialogOpen} open={mergeDialogOpen}>
				<DialogTrigger
					asChild
					disabled={selectedClient === null || selectedNote === null}
				>
					<Button size="lg">Preview Merge</Button>
				</DialogTrigger>
				<DialogContent className="max-h-[calc(100vh-4rem)] max-w-fit overflow-x-hidden overflow-y-scroll sm:max-w-fit">
					<DialogTitle>Preview Merge</DialogTitle>
					<div className="flex w-full min-w-[calc(100vw-5rem)] flex-col justify-between gap-10 md:flex-row lg:min-w-5xl">
						<Client hash={selectedClient?.hash ?? ""} readOnly />
						<div className="flex flex-col items-center gap-4">
							<Button
								onClick={() =>
									selectedClient?.id !== undefined &&
									selectedNote?.id !== undefined &&
									replaceNotes({
										clientId: selectedClient?.id,
										fakeClientId: selectedNote?.id,
									})
								}
							>
								<ArrowLeft className="hidden sm:block" />
								<ArrowUp className="sm:hidden" />
								Append Notes & Delete Fake
							</Button>
							<p className="max-w-[20ch] text-muted-foreground text-sm">
								Notes from the client on the right will be added to the end of
								the notes of the client on the left.
							</p>
							<p className="max-w-[20ch] text-muted-foreground text-sm">
								The title of the notes on the right will replace the title of
								the notes on the left.
							</p>
						</div>
						<Client hash={selectedNote?.hash ?? ""} readOnly />
					</div>
				</DialogContent>
			</Dialog>

			<div className="flex w-full flex-col gap-3 lg:w-1/3">
				<h2 className="font-semibold text-xl">Notes Only</h2>
				<NameSearchInput
					debounceMs={300}
					initialValue={""}
					onDebouncedChange={(name) => {
						setDebouncedNameForNotesQuery(name);
					}}
				/>
				{isLoadingNotes ? (
					<Skeleton className="h-[400px] w-full" />
				) : (
					<div
						className={
							isPlaceholderNotes
								? "opacity-60 transition-opacity duration-200"
								: "opacity-100 transition-opacity duration-200"
						}
					>
						<SelectableClientsList
							clients={notes ?? []}
							onSelectionChange={setSelectedNote}
							selectedClient={selectedNote}
							showId={false}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

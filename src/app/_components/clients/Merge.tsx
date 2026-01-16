"use client";

import { MergePreviewDialog } from "@components/clients/MergePreviewDialog";
import { NameSearchInput } from "@components/clients/NameSearchInput";
import { SelectableClientsList } from "@components/clients/SelectableClientsList";
import { Button } from "@ui/button";
import { Skeleton } from "@ui/skeleton";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { SortedClient } from "~/lib/types";
import { api } from "~/trpc/react";

export function Merge() {
	const searchParams = useSearchParams();
	const realHash = searchParams.get("real");
	const fakeHash = searchParams.get("fake");

	const [
		debouncedNameForImportedClientsQuery,
		setDebouncedNameForImportedClientsQuery,
	] = useState("");

	const [debouncedNameForNotesQuery, setDebouncedNameForNotesQuery] =
		useState("");

	const { data: preSelectedReal } = api.clients.getOne.useQuery(
		{ column: "hash", value: realHash ?? "" },
		{ enabled: !!realHash },
	);

	const { data: preSelectedFake } = api.clients.getOne.useQuery(
		{ column: "hash", value: fakeHash ?? "" },
		{ enabled: !!fakeHash },
	);

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
		{ nameSearch: finalImportedClientsNameSearch, type: "real" },
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

	const clients = useMemo(() => {
		const baseClients = importedClientsQuery?.clients ?? [];
		if (
			preSelectedReal &&
			!baseClients.some((c) => c.id === preSelectedReal.id)
		) {
			return [preSelectedReal, ...baseClients] as SortedClient[];
		}
		return baseClients as SortedClient[];
	}, [importedClientsQuery, preSelectedReal]);

	const [selectedClient, setSelectedClient] = useState<SortedClient | null>(
		null,
	);

	const notes = useMemo(() => {
		const baseNotes = notesQuery?.clients ?? [];
		if (
			preSelectedFake &&
			!baseNotes.some((c) => c.id === preSelectedFake.id)
		) {
			return [preSelectedFake, ...baseNotes] as SortedClient[];
		}
		return baseNotes as SortedClient[];
	}, [notesQuery, preSelectedFake]);

	const [selectedNote, setSelectedNote] = useState<SortedClient | null>(null);

	useEffect(() => {
		if (preSelectedReal) {
			setSelectedClient(preSelectedReal as unknown as SortedClient);
		}
	}, [preSelectedReal]);

	useEffect(() => {
		if (preSelectedFake) {
			setSelectedNote(preSelectedFake as unknown as SortedClient);
		}
	}, [preSelectedFake]);

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

			<MergePreviewDialog
				fakeClient={selectedNote}
				onSuccess={() => {
					setSelectedNote(null);
				}}
				realClient={selectedClient}
			>
				<Button
					disabled={selectedClient === null || selectedNote === null}
					size="lg"
				>
					Preview Merge
				</Button>
			</MergePreviewDialog>

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

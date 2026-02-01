"use client";
import { MergePreviewDialog } from "@components/clients/MergePreviewDialog";
import { Button } from "@ui/button";
import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import { format, formatDistanceToNow } from "date-fns";
import { MapIcon, Pin, PinOff, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type {
	DuplicateDriveGroup,
	SharedQuestionnaireData,
} from "~/lib/api-types";
import type { Client, ClientWithIssueInfo } from "~/lib/models";

import { api } from "~/trpc/react";

interface IssueListProps {
	title: string;
	description?: string;
	clients: ClientWithIssueInfo[];
	action?: React.ReactNode;
}

const IssueList = ({ title, description, clients, action }: IssueListProps) => {
	const utils = api.useUtils();
	const savedClientRef = useRef<HTMLDivElement>(null);
	const savedPlaceKey = title
		.split(" ")
		.map((word, index) =>
			index === 0
				? word.toLowerCase()
				: word.replace(/^[a-z]/, (letter) => letter.toUpperCase()),
		)
		.join("");

	const { data: savedPlaces } = api.users.getSavedPlaces.useQuery();
	const savedPlaceData = savedPlaces?.[savedPlaceKey || ""];
	const savedPlaceHash = savedPlaceData?.hash;
	const savedPlaceIndex =
		typeof savedPlaceData === "object" && savedPlaceData !== null
			? savedPlaceData?.index
			: undefined;

	const { mutate: updateSavedPlaces } = api.users.updateSavedPlaces.useMutation(
		{
			onSuccess: () => {
				utils.users.getSavedPlaces.invalidate();
			},
		},
	);

	const { mutate: deleteSavedPlace } = api.users.deleteSavedPlace.useMutation({
		onSuccess: () => {
			utils.users.getSavedPlaces.invalidate();
		},
	});

	useEffect(() => {
		if (!savedPlaceKey || !savedPlaceHash || clients.length === 0) return;

		const savedClientIndex = clients.findIndex(
			(client) => client.hash === savedPlaceHash,
		);

		if (savedClientIndex === -1) {
			const fallbackIndex =
				savedPlaceIndex !== undefined
					? Math.min(savedPlaceIndex - 1, clients.length - 1)
					: 0;

			if (clients[fallbackIndex]) {
				updateSavedPlaces({
					key: savedPlaceKey,
					hash: clients[fallbackIndex].hash,
					index: fallbackIndex,
				});
			}
		}
	}, [
		clients,
		savedPlaceKey,
		savedPlaceHash,
		savedPlaceIndex,
		updateSavedPlaces,
	]);

	const isSavedClient = (clientHash: string) => {
		return savedPlaceKey && savedPlaceHash === clientHash;
	};

	const scrollToSavedClient = () => {
		if (savedClientRef.current) {
			savedClientRef.current.scrollIntoView({
				behavior: "smooth",
			});
		}
	};

	return (
		<div className="flex max-h-80">
			<ScrollArea
				className="w-xs rounded-md border bg-card text-card-foreground shadow"
				type="auto"
			>
				<div className="p-4">
					<div className="flex items-center justify-between gap-4">
						<h1 className="mb-1 font-bold text-lg leading-none">
							{title}{" "}
							<span className="font-medium text-muted-foreground text-sm">
								({clients.length})
							</span>
						</h1>
						<div className="mb-1 flex items-center gap-2">
							{savedPlaceKey && savedPlaceHash && (
								<Button
									aria-label="Scroll to saved client"
									className="font-medium text-muted-foreground text-xs"
									onClick={scrollToSavedClient}
									size="sm"
									type="button"
									variant="ghost"
								>
									<MapIcon className="h-3 w-3" />
									<span className="hidden sm:block">Go to saved</span>
								</Button>
							)}
							{action && <div>{action}</div>}
						</div>
					</div>
					{description && (
						<p className="mb-4 text-muted-foreground text-xs">{description}</p>
					)}
					{clients.map((client, index) => (
						<div
							className="scroll-mt-12"
							key={client.hash}
							ref={isSavedClient(client.hash) ? savedClientRef : null}
						>
							<Link href={`/clients/${client.hash}`} key={client.hash}>
								<div className="text-sm" key={client.hash}>
									{client.fullName}{" "}
									{client.additionalInfo && (
										<span className="text-muted-foreground">
											{client.additionalInfo}
										</span>
									)}
									{client.initialFailureDate && (
										<span className="ml-1 text-muted-foreground">
											(first failed{" "}
											{format(new Date(client.initialFailureDate), "MM/dd/yy")})
										</span>
									)}
								</div>
							</Link>
							{isSavedClient(client.hash) && (
								<button
									aria-label={`Remove ${client.fullName} as saved client for ${title}`}
									className="group relative flex w-full cursor-pointer items-center py-2"
									onClick={() => {
										if (savedPlaceKey) {
											deleteSavedPlace({ key: savedPlaceKey });
										}
									}}
									type="button"
								>
									<Separator className="my-2 flex-1 rounded bg-accent data-[orientation=horizontal]:h-1" />
									<div className="pointer-events-none absolute top-1/2 right-0 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100">
										<PinOff className="h-4 w-4" />
									</div>
								</button>
							)}

							{index < clients.length - 1 &&
								savedPlaceKey &&
								!isSavedClient(client.hash) && (
									<button
										aria-label={`Set ${client.fullName} as saved client for ${title}`}
										className="group relative flex w-full cursor-pointer items-center py-2"
										onClick={() => {
											updateSavedPlaces({
												key: savedPlaceKey,
												hash: client.hash,
												index,
											});
										}}
										type="button"
									>
										<Separator className="flex-1" />
										<div className="pointer-events-none absolute top-1/2 right-0 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100">
											<Pin className="h-4 w-4" />
										</div>
									</button>
								)}

							{index < clients.length - 1 && !savedPlaceKey && (
								<Separator className="my-2" />
							)}
						</div>
					))}
				</div>
			</ScrollArea>
		</div>
	);
};

interface SuggestionIssueListProps {
	title: string;
	description?: string;
	items: {
		id: string;
		name: string;
		hash?: string;
		suggestions: Client[];
		originalData?: Client; // For MergePreviewDialog if it's a NoteOnly client
	}[];
	onAction?: (itemId: string, suggestedId: number) => void;
	isActioning?: boolean;
	actionButtonText?: string;
	action?: React.ReactNode;
}

const SuggestionIssueList = ({
	title,
	description,
	items,
	onAction: onFix,
	isActioning: isFixing,
	actionButtonText: fixButtonText = "Fix",
	action,
}: SuggestionIssueListProps) => {
	const utils = api.useUtils();
	const savedClientRef = useRef<HTMLDivElement>(null);
	const savedPlaceKey = title
		.split(" ")
		.map((word, index) =>
			index === 0
				? word.toLowerCase()
				: word.replace(/^[a-z]/, (letter) => letter.toUpperCase()),
		)
		.join("");

	const { data: savedPlaces } = api.users.getSavedPlaces.useQuery();
	const savedPlaceData = savedPlaces?.[savedPlaceKey || ""];
	const savedPlaceHash = savedPlaceData?.hash;
	const savedPlaceIndex =
		typeof savedPlaceData === "object" && savedPlaceData !== null
			? savedPlaceData?.index
			: undefined;

	const { mutate: updateSavedPlaces } = api.users.updateSavedPlaces.useMutation(
		{
			onSuccess: () => {
				utils.users.getSavedPlaces.invalidate();
			},
		},
	);

	const { mutate: deleteSavedPlace } = api.users.deleteSavedPlace.useMutation({
		onSuccess: () => {
			utils.users.getSavedPlaces.invalidate();
		},
	});

	useEffect(() => {
		if (!savedPlaceKey || !savedPlaceHash || items.length === 0) return;

		const savedItemIndex = items.findIndex(
			(item) => item.id === savedPlaceHash,
		);

		if (savedItemIndex === -1) {
			const fallbackIndex =
				savedPlaceIndex !== undefined
					? Math.min(savedPlaceIndex - 1, items.length - 1)
					: 0;

			if (items[fallbackIndex]) {
				updateSavedPlaces({
					key: savedPlaceKey,
					hash: items[fallbackIndex].id,
					index: fallbackIndex,
				});
			}
		}
	}, [
		items,
		savedPlaceKey,
		savedPlaceHash,
		savedPlaceIndex,
		updateSavedPlaces,
	]);

	const isSavedItem = (itemId: string) => {
		return savedPlaceKey && savedPlaceHash === itemId;
	};

	const scrollToSavedItem = () => {
		if (savedClientRef.current) {
			savedClientRef.current.scrollIntoView({
				behavior: "smooth",
			});
		}
	};

	return (
		<div className="flex max-h-80">
			<ScrollArea
				className="w-md rounded-md border bg-card text-card-foreground shadow"
				type="auto"
			>
				<div className="p-4">
					<div className="flex items-center justify-between gap-4">
						<h1 className="mb-1 font-bold text-lg leading-none">
							{title}{" "}
							<span className="font-medium text-muted-foreground text-sm">
								({items.length})
							</span>
						</h1>
						<div className="mb-1 flex items-center gap-2">
							{savedPlaceKey && savedPlaceHash && (
								<Button
									aria-label="Scroll to saved client"
									className="font-medium text-muted-foreground text-xs"
									onClick={scrollToSavedItem}
									size="sm"
									type="button"
									variant="ghost"
								>
									<MapIcon className="h-3 w-3" />
									<span className="hidden sm:block">Go to saved</span>
								</Button>
							)}
							{action && <div>{action}</div>}
						</div>
					</div>
					{description && (
						<p className="mb-4 text-muted-foreground text-xs">{description}</p>
					)}
					<div>
						{items.map((item, index) => (
							<div
								className="scroll-mt-12"
								key={item.id}
								ref={isSavedItem(item.id) ? savedClientRef : null}
							>
								<div className="mb-1 flex items-center justify-between gap-2">
									{item.hash ? (
										<Link href={`/clients/${item.hash}`}>
											<div className="font-medium text-sm hover:underline">
												{item.name}
											</div>
										</Link>
									) : (
										<div className="font-medium text-sm">
											{item.name}{" "}
											<span className="font-normal text-muted-foreground text-xs">
												(ID: {item.id})
											</span>
										</div>
									)}
								</div>

								{item.suggestions.length > 0 && (
									<div className="mt-2 rounded-md border bg-muted p-2">
										<p className="mb-1 font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
											Suggestions:
										</p>
										<div className="space-y-2">
											{item.suggestions.map((suggestion) => (
												<div
													className="flex items-center justify-between gap-2"
													key={suggestion.id}
												>
													<Link href={`/clients/${suggestion.hash}`}>
														<div className="text-xs hover:underline">
															{suggestion.fullName}
															<span className="ml-1 text-muted-foreground">
																(ID: {suggestion.id})
															</span>
														</div>
													</Link>
													{onFix ? (
														<Button
															className="h-6 cursor-pointer px-2 text-[10px]"
															disabled={isFixing}
															onClick={() => onFix(item.id, suggestion.id)}
															size="sm"
															variant="outline"
														>
															{fixButtonText}
														</Button>
													) : (
														item.originalData && (
															<MergePreviewDialog
																fakeClient={item.originalData}
																realClient={suggestion}
															>
																<Button
																	className="h-6 cursor-pointer px-2 text-[10px]"
																	size="sm"
																	variant="outline"
																>
																	Merge
																</Button>
															</MergePreviewDialog>
														)
													)}
												</div>
											))}
										</div>
									</div>
								)}

								{isSavedItem(item.id) && (
									<button
										aria-label={`Remove ${item.name} as saved client for ${title}`}
										className="group relative flex w-full cursor-pointer items-center py-2"
										onClick={() => {
											if (savedPlaceKey) {
												deleteSavedPlace({ key: savedPlaceKey });
											}
										}}
										type="button"
									>
										<Separator className="my-2 flex-1 rounded bg-accent data-[orientation=horizontal]:h-1" />
										<div className="pointer-events-none absolute top-1/2 right-0 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100">
											<PinOff className="h-4 w-4" />
										</div>
									</button>
								)}

								{index < items.length - 1 &&
									savedPlaceKey &&
									!isSavedItem(item.id) && (
										<button
											aria-label={`Set ${item.name} as saved client for ${title}`}
											className="group relative flex w-full cursor-pointer items-center py-2"
											onClick={() => {
												updateSavedPlaces({
													key: savedPlaceKey,
													hash: item.id,
													index,
												});
											}}
											type="button"
										>
											<Separator className="flex-1" />
											<div className="pointer-events-none absolute top-1/2 right-0 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100">
												<Pin className="h-4 w-4" />
											</div>
										</button>
									)}

								{index < items.length - 1 && !savedPlaceKey && (
									<Separator className="mt-4" />
								)}
							</div>
						))}
					</div>
				</div>
			</ScrollArea>
		</div>
	);
};

const IssueListSkeleton = () => (
	<div className="flex max-h-80 w-80 animate-pulse">
		<div className="w-full rounded-md border bg-card p-4 shadow">
			<div className="flex items-center justify-between gap-4">
				<div className="mb-4 h-6 w-3/4 rounded bg-muted-foreground/20" />
				<div className="mb-4 h-8 w-12 rounded bg-muted-foreground/20" />
			</div>
			<div className="space-y-4">
				<div className="h-4 w-11/12 rounded bg-muted-foreground/10" />
				<div className="h-4 w-10/12 rounded bg-muted-foreground/10" />
				<div className="h-4 w-9/12 rounded bg-muted-foreground/10" />
				<div className="h-4 w-11/12 rounded bg-muted-foreground/10" />
			</div>
		</div>
	</div>
);

const DuplicateDriveFoldersList = ({
	duplicates,
	lastFetched,
}: {
	duplicates: DuplicateDriveGroup[];
	lastFetched: number;
}) => {
	const utils = api.useUtils();

	const { mutate: invalidateCacheMutate, isPending } =
		api.google.invalidateDuplicatesCache.useMutation({
			onSuccess: async () => {
				await utils.google.findDuplicates.invalidate();
				await utils.google.findDuplicates.refetch();
			},
		});

	const handleForceRefresh = () => {
		invalidateCacheMutate();
	};

	return (
		<div className="flex max-h-80">
			<ScrollArea
				className="w-md rounded-md border bg-card text-card-foreground shadow"
				type="auto"
			>
				<div className="flex flex-col p-4">
					<div className="flex items-center justify-between">
						<h1 className="font-bold text-lg leading-none">
							Duplicate Drive Folders{" "}
							<span className="font-medium text-muted-foreground text-sm">
								({duplicates.length} client{duplicates.length !== 1 ? "s" : ""})
							</span>
						</h1>
						<Button
							aria-label="Force refresh duplicate drive folders"
							className="cursor-pointer"
							disabled={isPending}
							onClick={handleForceRefresh}
							size="icon-sm"
							variant="outline"
						>
							{isPending ? (
								<span className="rotate-180 transform animate-spin">
									<RotateCw />
								</span>
							) : (
								<span>
									<RotateCw />
								</span>
							)}
						</Button>
					</div>
					<div className="mb-2">
						<p className="flex gap-1 text-sm">
							<span>Last updated:</span>
							<span>
								{formatDistanceToNow(new Date(lastFetched), {
									addSuffix: true,
								})}
							</span>
							<span className="text-muted-foreground">
								{new Intl.DateTimeFormat("en-US", {
									day: "2-digit",
									month: "2-digit",
									hour: "numeric",
									minute: "numeric",
									timeZone: "America/New_York",
								}).format(new Date(lastFetched))}
							</span>
						</p>
						<p className="max-w-md text-muted-foreground text-sm">
							Multiple Google Drive folders found for the same client ID.
						</p>
					</div>
					<div className="flex flex-col gap-4">
						{duplicates.map((group) => (
							<div
								className="rounded-md border bg-muted p-3"
								key={group.clientId}
							>
								<div className="mb-2 font-bold text-lg">
									<Link href={`/clients/${group.clientHash}`}>
										<span className="hover:underline">
											{group.clientFullName}
										</span>
									</Link>
									<span className="ml-2 font-medium text-muted-foreground text-sm">
										[{group.clientId}]
									</span>
								</div>

								<div className="space-y-2">
									{group.folders.map((folder) => (
										<div key={folder.id}>
											<Link
												href={folder.url ?? "#"}
												rel="noopener noreferrer"
												target="_blank"
											>
												<div className="flex items-baseline gap-1 text-sm hover:underline">
													<span>{folder.name}</span>
													{folder.isDbMatch && (
														<span className="font-semibold text-primary text-xs">
															(W Folder)
														</span>
													)}
												</div>
											</Link>
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				</div>
			</ScrollArea>
		</div>
	);
};

const ClientsSharingQuestionnaires = ({
	sharedLinksData,
}: {
	sharedLinksData: SharedQuestionnaireData[];
}) => {
	return (
		<div className="flex max-h-80">
			<ScrollArea
				className="w-md rounded-md border bg-card text-card-foreground shadow"
				type="auto"
			>
				<div className="p-4">
					<h1 className="mb-1 font-bold text-lg leading-none">
						Clients Sharing Questionnaires{" "}
						<span className="font-medium text-muted-foreground text-sm">
							({sharedLinksData.length} shared link
							{sharedLinksData.length > 1 ? "s" : ""})
						</span>
					</h1>
					<p className="mb-4 text-muted-foreground text-xs">
						Multiple clients with the same questionnaire link between them.
					</p>
					<div className="space-y-4">
						{sharedLinksData.map(({ link, clients }) => (
							<div className="rounded-md border p-3" key={link}>
								<div className="mb-2 font-medium text-muted-foreground text-sm">
									Link:{" "}
									<Link href={link ?? "#"} target="_blank">
										{link}
									</Link>
								</div>
								<div className="space-y-2">
									{clients.map(({ client, count }, index) => (
										<div key={client.id}>
											<Link href={`/clients/${client.hash}`}>
												<div className="text-sm hover:underline">
													{client.fullName}
													<span className="ml-2 text-muted-foreground text-xs">
														({count} count{count > 1 ? "s" : ""})
													</span>
												</div>
											</Link>
											{index < clients.length - 1 && (
												<Separator className="my-2" />
											)}
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				</div>
			</ScrollArea>
		</div>
	);
};

export function IssuesList() {
	const utils = api.useUtils();
	const { data: districtErrors, isLoading: isLoadingDistrictErrors } =
		api.clients.getDistrictErrors.useQuery();
	const { clientsWithoutDistrict = [], clientsWithDistrictFromShapefile = [] } =
		districtErrors ?? {};
	const { data: babyNetErrors, isLoading: isLoadingBabyNetErrors } =
		api.clients.getBabyNetErrors.useQuery();

	const { mutate: autoUpdateBabyNet } =
		api.clients.autoUpdateBabyNet.useMutation({
			onSuccess: (data) => {
				if (data.count > 0) {
					utils.clients.getBabyNetErrors.invalidate();
				}
			},
		});

	useEffect(() => {
		if (babyNetErrors && babyNetErrors.length > 0) {
			autoUpdateBabyNet();
		}
	}, [babyNetErrors, autoUpdateBabyNet]);

	const { data: notInTAErrors, isLoading: isLoadingNotInTAErrors } =
		api.clients.getNotInTAErrors.useQuery();
	const { data: dropList, isLoading: isLoadingDropList } =
		api.clients.getDropList.useQuery();
	const { data: autismStops, isLoading: isLoadingAutismStops } =
		api.clients.getAutismStops.useQuery();
	const { data: needsBabyNetERDownloaded } =
		api.clients.getNeedsBabyNetERDownloaded.useQuery();
	const { data: noteOnlyClients, isLoading: isLoadingNoteOnlyClients } =
		api.clients.getNoteOnlyClients.useQuery();
	const { data: mergeSuggestions, isLoading: isLoadingMergeSuggestions } =
		api.clients.getMergeSuggestions.useQuery();
	const { data: noDriveIds, isLoading: isLoadingNoDriveIds } =
		api.clients.getNoDriveIdErrors.useQuery();
	const {
		data: missingRecordsNeeded,
		isLoading: isLoadingMissingRecordsNeeded,
	} = api.clients.getMissingRecordsNeeded.useQuery();
	const {
		data: duplicateFolderNames,
		isLoading: isLoadingDuplicateFolderNames,
	} = api.google.findDuplicates.useQuery();
	const { data: dd4, isLoading: isLoadingDD4 } = api.clients.getDD4.useQuery();
	const { data: possiblePrivatePay, isLoading: isLoadingPossiblePrivatePay } =
		api.clients.getPossiblePrivatePay.useQuery();
	const { data: unreviewedRecords } =
		api.clients.getUnreviewedRecords.useQuery();
	const { data: duplicateQLinks, isLoading: isLoadingDuplicateQLinks } =
		api.questionnaires.getDuplicateLinks.useQuery();
	const { data: justAddedQuestionnaires, isLoading: isLoadingJustAdded } =
		api.questionnaires.getJustAdded.useQuery();
	const { data: punchlistIssues, isLoading: isLoadingPunchlistIssues } =
		api.google.verifyPunchClients.useQuery();

	const { mutate: updatePunchId, isPending: isFixingPunchId } =
		api.google.updatePunchId.useMutation({
			onSuccess: () => {
				utils.google.verifyPunchClients.invalidate();
			},
		});

	const punchlistDuplicateIds =
		punchlistIssues?.duplicateIdClients.map(
			(c) =>
				({
					...c,
					fullName: c.fullName ?? c["Client Name"] ?? "Unknown",
					hash: c.hash ?? "",
					additionalInfo: `(ID: ${c["Client ID"]}, found ${
						(c as unknown as { duplicateCount: number }).duplicateCount
					} times)`,
				}) as ClientWithIssueInfo,
		) ?? [];

	const clientsWithDuplicateLinks =
		duplicateQLinks?.duplicatePerClient
			.map((item) => item.client)
			.filter((client): client is Client => client !== undefined)
			.filter(
				(client, index, self) =>
					self.findIndex((c) => c.id === client.id) === index,
			) ?? [];

	const sortedNoteOnlyClients = [...(noteOnlyClients ?? [])].sort((a, b) => {
		const aHasSuggestion = mergeSuggestions?.some(
			(s) => s.noteOnlyClient.id === a.id,
		);
		const bHasSuggestion = mergeSuggestions?.some(
			(s) => s.noteOnlyClient.id === b.id,
		);

		if (aHasSuggestion && !bHasSuggestion) return -1;
		if (!aHasSuggestion && bHasSuggestion) return 1;

		return (
			(noteOnlyClients ?? []).indexOf(a) - (noteOnlyClients ?? []).indexOf(b)
		);
	});

	return (
		<div className="flex flex-wrap justify-center gap-10">
			{isLoadingDD4 && <IssueListSkeleton />}
			{!isLoadingDD4 && dd4 && dd4.length !== 0 && (
				<IssueList
					clients={dd4}
					description="Clients located in Dorchester District 4."
					title="In DD4"
				/>
			)}
			{isLoadingJustAdded && <IssueListSkeleton />}
			{!isLoadingJustAdded &&
				justAddedQuestionnaires &&
				justAddedQuestionnaires.length !== 0 && (
					<IssueList
						clients={justAddedQuestionnaires}
						description="Questionnaires generated but not sent to client."
						title="Just Added Questionnaires"
					/>
				)}
			{isLoadingDistrictErrors && <IssueListSkeleton />}
			{!isLoadingDistrictErrors &&
				clientsWithoutDistrict &&
				clientsWithoutDistrict.length !== 0 && (
					<IssueList
						clients={clientsWithoutDistrict}
						description="Clients missing a school district."
						title="Missing Districts"
					/>
				)}
			{isLoadingPunchlistIssues && <IssueListSkeleton />}
			{!isLoadingPunchlistIssues &&
				punchlistIssues &&
				punchlistIssues.clientsNotInDb.length > 0 && (
					<SuggestionIssueList
						actionButtonText="Update Punch ID"
						description="Clients on the punchlist but not in the database, likely incorrect IDs."
						isActioning={isFixingPunchId}
						items={punchlistIssues.clientsNotInDb.map((c) => ({
							id: c["Client ID"] ?? "",
							name: c["Client Name"] ?? "Unknown",
							suggestions: c.suggestions,
						}))}
						onAction={(itemId, suggestedId) =>
							updatePunchId({ currentId: itemId, newId: suggestedId })
						}
						title="Punchlist Clients Not In DB"
					/>
				)}
			{!isLoadingPunchlistIssues &&
				punchlistIssues &&
				punchlistIssues.inactiveClients.length > 0 && (
					<IssueList
						clients={punchlistIssues.inactiveClients}
						description="Inactive clients currently on the punchlist."
						title="Punchlist Clients Inactive"
					/>
				)}
			{punchlistDuplicateIds.length > 0 && (
				<IssueList
					clients={punchlistDuplicateIds as ClientWithIssueInfo[]}
					description="Duplicate client IDs found on the punchlist."
					title="Duplicate Punchlist IDs"
				/>
			)}
			{isLoadingDistrictErrors && <IssueListSkeleton />}
			{!isLoadingDistrictErrors &&
				clientsWithDistrictFromShapefile &&
				clientsWithDistrictFromShapefile.length !== 0 && (
					<IssueList
						clients={clientsWithDistrictFromShapefile}
						description="Districts found after cutting the address in some way for search, should be manually double-checked."
						title="District Found After Cut Address"
					/>
				)}
			{isLoadingBabyNetErrors && <IssueListSkeleton />}
			{!isLoadingBabyNetErrors &&
				babyNetErrors &&
				babyNetErrors.length !== 0 && (
					<IssueList
						clients={babyNetErrors}
						description="Clients who have aged out of BabyNet eligibility, but still have it listed."
						title="Too Old for BabyNet"
					/>
				)}
			{isLoadingNotInTAErrors && <IssueListSkeleton />}
			{!isLoadingNotInTAErrors &&
				notInTAErrors &&
				notInTAErrors.length !== 0 && (
					<IssueList
						clients={notInTAErrors}
						description='Clients who were not imported from TA and were not added using the "Shell Client"/"Notes Only" feature.'
						title="Not in TA"
					/>
				)}
			{isLoadingDropList && <IssueListSkeleton />}
			{!isLoadingDropList && dropList && dropList.length !== 0 && (
				<IssueList
					clients={dropList}
					description="Clients who have been reminded more than 3 times and aren't completing tasks."
					title="Drop List"
				/>
			)}
			{isLoadingAutismStops && <IssueListSkeleton />}
			{!isLoadingAutismStops && autismStops && autismStops.length !== 0 && (
				<IssueList
					clients={autismStops}
					description='"Autism" found in school records, should be discharged.'
					title="Autism Stops"
				/>
			)}
			{needsBabyNetERDownloaded && needsBabyNetERDownloaded.length !== 0 && (
				<IssueList
					clients={needsBabyNetERDownloaded}
					description="BabyNet Evaluation Report marked needed but not downloaded."
					title="Needs BabyNet ER Downloaded"
				/>
			)}
			{(isLoadingNoteOnlyClients || isLoadingMergeSuggestions) && (
				<IssueListSkeleton />
			)}
			{!isLoadingNoteOnlyClients &&
				!isLoadingMergeSuggestions &&
				noteOnlyClients &&
				noteOnlyClients.length !== 0 && (
					<SuggestionIssueList
						action={
							<Link href="/clients/merge">
								<Button className="cursor-pointer" size="sm" variant="outline">
									Merge Menu
								</Button>
							</Link>
						}
						description='"Shell" clients created, should be merged with "Real" client from TA when possible.'
						items={sortedNoteOnlyClients.map((client) => ({
							id: client.id.toString(),
							name: client.fullName,
							hash: client.hash,
							originalData: client,
							suggestions:
								mergeSuggestions?.find((s) => s.noteOnlyClient.id === client.id)
									?.suggestedRealClients ?? [],
						}))}
						title="Notes Only"
					/>
				)}
			{isLoadingNoDriveIds && <IssueListSkeleton />}
			{!isLoadingNoDriveIds && noDriveIds && noDriveIds.length !== 0 && (
				<IssueList
					clients={noDriveIds}
					description="Clients missing a Google Drive folder ID."
					title="No Drive IDs"
				/>
			)}
			{isLoadingPossiblePrivatePay && <IssueListSkeleton />}
			{!isLoadingPossiblePrivatePay &&
				possiblePrivatePay &&
				possiblePrivatePay.length !== 0 && (
					<IssueList
						clients={possiblePrivatePay}
						description="Clients with no eligible evaluators based on insurance and district/zip code."
						title="Potential Private Pay"
					/>
				)}
			{isLoadingMissingRecordsNeeded && <IssueListSkeleton />}
			{!isLoadingMissingRecordsNeeded &&
				missingRecordsNeeded &&
				missingRecordsNeeded.length !== 0 && (
					<IssueList
						clients={missingRecordsNeeded}
						description="Clients whose records needed status is not set."
						title="Records Needed Not Set"
					/>
				)}
			{unreviewedRecords && unreviewedRecords.length !== 0 && (
				<IssueList
					clients={unreviewedRecords}
					description="Records needed and requested more than 3 weekdays ago, but not reviewed."
					title="Unreviewed/Unreceived Records"
				/>
			)}
			{isLoadingDuplicateFolderNames && <IssueListSkeleton />}
			{!isLoadingDuplicateFolderNames &&
				duplicateFolderNames &&
				duplicateFolderNames.data.length > 0 && (
					<DuplicateDriveFoldersList
						duplicates={duplicateFolderNames.data}
						lastFetched={duplicateFolderNames.lastFetched}
					/>
				)}
			{isLoadingDuplicateQLinks && <IssueListSkeleton />}
			{!isLoadingDuplicateQLinks &&
				duplicateQLinks &&
				clientsWithDuplicateLinks.length > 0 && (
					<IssueList
						clients={clientsWithDuplicateLinks}
						description="Clients who have the same questionnaire link multiple times."
						title="Clients with Duplicate Questionnaire Links"
					/>
				)}
			{isLoadingDuplicateQLinks && <IssueListSkeleton />}
			{!isLoadingDuplicateQLinks &&
				duplicateQLinks?.sharedAcrossClients &&
				duplicateQLinks.sharedAcrossClients.length > 0 && (
					<ClientsSharingQuestionnaires
						sharedLinksData={duplicateQLinks.sharedAcrossClients}
					/>
				)}
		</div>
	);
}

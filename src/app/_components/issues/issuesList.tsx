"use client";
import { Button } from "@ui/button";
import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import { MapIcon, Pin, PinOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { Client, ClientWithIssueInfo } from "~/server/lib/types";
import { api } from "~/trpc/react";

interface IssueListProps {
	title: string;
	clients: ClientWithIssueInfo[];
	action?: React.ReactNode;
	savedPlaceKey?: string;
}

const IssueList = ({ title, clients, action }: IssueListProps) => {
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
				className="w-full rounded-md border bg-card text-card-foreground shadow md:min-w-xs"
				type="auto"
			>
				<div className="p-4">
					<div className="flex items-center justify-between gap-4">
						<h1 className="mb-4 font-bold text-lg leading-none">
							{title}{" "}
							<span className="font-medium text-muted-foreground text-sm">
								({clients.length})
							</span>
						</h1>
						<div className="mb-4 flex items-center gap-2">
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
									<div className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute top-1/2 right-0 z-10 rounded-full bg-accent px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100">
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
										<div className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute top-1/2 right-0 z-10 rounded-full bg-muted px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100">
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

export function IssuesList() {
	const { data: districtErrors } = api.clients.getDistrictErrors.useQuery();
	const { clientsWithoutDistrict = [], clientsWithDistrictFromShapefile = [] } =
		districtErrors ?? {};
	const { data: babyNetErrors } = api.clients.getBabyNetErrors.useQuery();
	const { data: notInTAErrors } = api.clients.getNotInTAErrors.useQuery();
	const { data: dropList } = api.clients.getDropList.useQuery();
	const { data: noteOnlyClients } = api.clients.getNoteOnlyClients.useQuery();
	const { data: duplicateDriveIds } =
		api.clients.getDuplicateDriveIdErrors.useQuery();
	const { data: noDriveIds } = api.clients.getNoDriveIdErrors.useQuery();
	const { data: possiblePrivatePay } =
		api.clients.getPossiblePrivatePay.useQuery();
	const { data: duplicateQLinks } =
		api.questionnaires.getDuplicateLinks.useQuery();

	const duplicatePerClientList =
		duplicateQLinks?.duplicatePerClient
			.map((item) => item.client)
			.filter((client): client is Client => client !== undefined)
			.filter(
				(client, index, self) =>
					self.findIndex((c) => c.id === client.id) === index,
			) ?? [];

	return (
		<div className="flex flex-wrap justify-center gap-10">
			{clientsWithoutDistrict && clientsWithoutDistrict.length !== 0 && (
				<IssueList clients={clientsWithoutDistrict} title="Missing Districts" />
			)}
			{clientsWithDistrictFromShapefile &&
				clientsWithDistrictFromShapefile.length !== 0 && (
					<IssueList
						clients={clientsWithDistrictFromShapefile}
						title="District Found After Cut Address"
					/>
				)}
			{babyNetErrors && babyNetErrors.length !== 0 && (
				<IssueList clients={babyNetErrors} title="Too Old for BabyNet" />
			)}
			{notInTAErrors && notInTAErrors.length !== 0 && (
				<IssueList clients={notInTAErrors} title="Not in TA" />
			)}
			{dropList && dropList.length !== 0 && (
				<IssueList clients={dropList} title="Drop List" />
			)}
			{noteOnlyClients && noteOnlyClients.length !== 0 && (
				<IssueList
					action={
						<Link href="/clients/merge">
							<Button size="sm" variant="outline">
								Merge
							</Button>
						</Link>
					}
					clients={noteOnlyClients}
					title="Notes Only"
				/>
			)}
			{duplicateDriveIds && duplicateDriveIds.length !== 0 && (
				<IssueList clients={duplicateDriveIds} title="Duplicate Drive IDs" />
			)}
			{noDriveIds && noDriveIds.length !== 0 && (
				<IssueList clients={noDriveIds} title="No Drive IDs" />
			)}
			{possiblePrivatePay && possiblePrivatePay.length !== 0 && (
				<IssueList clients={possiblePrivatePay} title="Potential Private Pay" />
			)}
			{duplicatePerClientList.length > 0 && (
				<IssueList
					clients={duplicatePerClientList}
					title="Clients with Duplicate Questionnaire Links"
				/>
			)}
			{duplicateQLinks?.sharedAcrossClients &&
				duplicateQLinks.sharedAcrossClients.length > 0 && (
					<div className="w-full rounded-md border bg-card text-card-foreground shadow md:min-w-xs">
						<div className="p-4">
							<h1 className="mb-4 font-bold text-lg leading-none">
								Clients Sharing Questionnaires{" "}
								<span className="font-medium text-muted-foreground text-sm">
									({duplicateQLinks.sharedAcrossClients.length} shared links)
								</span>
							</h1>
							<div className="space-y-6">
								{duplicateQLinks.sharedAcrossClients.map(
									({ link, clients }) => (
										<div className="rounded-md border p-3" key={link}>
											<div className="mb-2 font-medium text-muted-foreground text-sm">
												Link: <Link href={link}>{link}</Link>
											</div>
											<div className="space-y-2">
												{clients.map(({ client, count }, index) => (
													<div key={client.id}>
														<Link href={`/clients/${client.hash}`}>
															<div className="text-sm hover:underline">
																{client.fullName}
																<span className="ml-2 text-muted-foreground text-xs">
																	({count} time{count > 1 ? "s" : ""})
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
									),
								)}
							</div>
						</div>
					</div>
				)}
		</div>
	);
}

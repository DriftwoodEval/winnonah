"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import { Label } from "@ui/label";
import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@ui/toggle-group";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@ui/tooltip";
import {
	AlertTriangle,
	CalendarCheck,
	CalendarPlus,
	Loader2,
	MapIcon,
	Pin,
	PinOff,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { getHexFromColor, isClientColor } from "~/lib/colors";
import {
	type DashboardClient,
	SECTION_DA_QS_DONE,
	SECTION_DAEVAL_QS_DONE,
	SECTION_EVAL_QS_DONE,
	SECTION_NEEDS_OUTREACH,
	SECTION_REACHED_OUT_NEEDS_REVIEW,
	SECTION_RECORDS_NEEDED_NOT_REQUESTED,
	SECTION_RECORDS_REQUESTED_NOT_RETURNED,
} from "~/lib/dashboard";
import type { FullClientInfo } from "~/lib/models";
import { userBadgeStyle } from "~/lib/utils";
import { api } from "~/trpc/react";
import { Redact } from "../redaction/Redact";

interface PunchListAccordionProps {
	clients: DashboardClient[];
	title: string;
	description?: string;
	scheduledClientIds?: Set<number>;
}

function PunchListAccordionItem({
	clients,
	title,
	description,
	scheduledClientIds,
}: PunchListAccordionProps) {
	const { data: session } = useSession();
	const can = useCheckPermission();
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

	const claimOutreach = api.clients.claimOutreach.useMutation({
		onSuccess: () => {
			utils.google.getDashboardData.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to update claim", { description: error.message });
		},
	});

	const addScheduling = api.scheduling.add.useMutation({
		onSuccess: () => {
			toast.success("Added to scheduling");
			utils.scheduling.get.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to add to scheduling", {
				description: error.message,
			});
		},
	});

	const isQsBackSection =
		title === SECTION_DA_QS_DONE ||
		title === SECTION_EVAL_QS_DONE ||
		title === SECTION_DAEVAL_QS_DONE;

	const schedulingAddedCount =
		isQsBackSection && scheduledClientIds
			? clients.filter((c) => scheduledClientIds.has(c.id)).length
			: 0;

	const isOutreachSection =
		title === SECTION_NEEDS_OUTREACH ||
		title === SECTION_REACHED_OUT_NEEDS_REVIEW;
	const isClaimableSection = title === SECTION_NEEDS_OUTREACH;
	const isRecordsNotReturnedSection =
		title === SECTION_RECORDS_REQUESTED_NOT_RETURNED;
	const isRecordsNeededNotRequestedSection =
		title === SECTION_RECORDS_NEEDED_NOT_REQUESTED;

	return (
		<AccordionItem value={title}>
			<AccordionTrigger>
				<span className="flex items-center gap-1">
					{title}
					<span className="text-muted-foreground text-sm">
						({clients?.length})
					</span>
					{isQsBackSection && (
						<span className="text-muted-foreground text-sm">
							&middot; {schedulingAddedCount}/{clients?.length} on scheduling
							page
						</span>
					)}
				</span>
			</AccordionTrigger>
			<AccordionContent>
				{description && (
					<Alert className="mb-4">
						<AlertDescription>{description}</AlertDescription>
					</Alert>
				)}
				{savedPlaceKey && savedPlaceHash && (
					<div className="mb-2 flex justify-end">
						<Button
							aria-label="Scroll to saved client"
							className="font-medium text-muted-foreground text-xs"
							onClick={scrollToSavedClient}
							size="sm"
							type="button"
							variant="ghost"
						>
							<MapIcon className="h-3 w-3" />
							<span>Go to saved</span>
						</Button>
					</div>
				)}
				<ScrollArea className="h-[400px] w-full rounded-md border bg-card text-card-foreground shadow-sm">
					<div className="p-4">
						{clients?.map((client, index) => {
							const punchClient = client as FullClientInfo & DashboardClient;
							const onSchedulingTable = scheduledClientIds?.has(client.id);
							const language = client.language ?? punchClient.Language;

							return (
								<div
									className="scroll-mt-12"
									key={client.hash}
									ref={isSavedClient(client.hash) ? savedClientRef : null}
								>
									<div className="flex items-center justify-between gap-4">
										<Link
											className="no-underline! hover:no-underline! block grow"
											href={`/clients/${client.hash}${isOutreachSection ? "?tab=referral" : ""}`}
										>
											<div>
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-2">
														{punchClient.color &&
															isClientColor(punchClient.color) && (
																<span
																	className="h-3 w-3 shrink-0 rounded-full"
																	style={{
																		backgroundColor: getHexFromColor(
																			punchClient.color,
																		),
																	}}
																/>
															)}
														<span>
															<Redact>
																{client.fullName ?? punchClient["Client Name"]}
															</Redact>
														</span>
														{(isOutreachSection ||
															isRecordsNeededNotRequestedSection) &&
															language &&
															language.toLowerCase() !== "english" && (
																<span className="font-bold text-destructive text-xs">
																	({language})
																</span>
															)}
														{isClaimableSection &&
															client.referralData?.outreachClaimedBy && (
																<span className="text-muted-foreground text-xs">
																	Claimed by{" "}
																	{
																		client.referralData.outreachClaimedBy.split(
																			" ",
																		)[0]
																	}
																</span>
															)}
														{client.failures?.map((failure) => (
															<span
																className="hidden rounded-sm bg-destructive/10 px-1 py-0.5 text-[10px] text-destructive md:inline-block"
																key={failure.reason}
															>
																{failure.reason}
															</span>
														))}
														{isRecordsNotReturnedSection &&
															punchClient.evaluationInProcess && (
																<span className="hidden rounded-sm bg-destructive/10 px-1 py-0.5 text-[10px] text-destructive md:inline-block">
																	Eval In Process
																</span>
															)}
														{punchClient.autismStop && (
															<span className="hidden rounded-sm bg-destructive px-1 py-0.5 text-[10px] text-destructive-foreground md:inline-block">
																Autism Stop
															</span>
														)}
														{punchClient.pause && (
															<span className="hidden rounded-sm bg-destructive px-1 py-0.5 text-[10px] text-destructive-foreground md:inline-block">
																Paused
															</span>
														)}
													</div>
													{punchClient.extraInfo && (
														<span className="text-muted-foreground text-xs">
															{punchClient.extraInfo}
														</span>
													)}
												</div>
												{punchClient.matchedSections && (
													<span className="block text-muted-foreground text-xs">
														{punchClient.matchedSections.join(", ")}
													</span>
												)}
												{((client.failures && client.failures.length > 0) ||
													(isRecordsNotReturnedSection &&
														punchClient.evaluationInProcess) ||
													punchClient.autismStop ||
													punchClient.pause) && (
													<div className="mt-1 md:hidden">
														{client.failures?.map((failure) => (
															<span
																className="mr-1 inline-block rounded-sm bg-destructive/10 px-1 py-0.5 text-[10px] text-destructive"
																key={failure.reason}
															>
																{failure.reason}
															</span>
														))}
														{isRecordsNotReturnedSection &&
															punchClient.evaluationInProcess && (
																<span className="mr-1 inline-block rounded-sm bg-destructive/10 px-1 py-0.5 text-[10px] text-destructive">
																	Eval In Process
																</span>
															)}
														{punchClient.autismStop && (
															<span className="mr-1 inline-block rounded-sm bg-destructive px-1 py-0.5 text-[10px] text-destructive-foreground">
																Autism Stop
															</span>
														)}
														{punchClient.pause && (
															<span className="mr-1 inline-block rounded-sm bg-destructive px-1 py-0.5 text-[10px] text-destructive-foreground">
																Paused
															</span>
														)}
													</div>
												)}
											</div>
										</Link>
										{isClaimableSection && can("clients:referral:claim") && (
											<Button
												className="shrink-0"
												disabled={claimOutreach.isPending}
												onClick={(e) => {
													e.preventDefault();
													claimOutreach.mutate({ clientId: client.id });
												}}
												size="sm"
												variant={
													client.referralData?.outreachClaimedBy ===
													session?.user?.name
														? "secondary"
														: "ghost"
												}
											>
												{claimOutreach.isPending &&
												claimOutreach.variables?.clientId === client.id ? (
													<Loader2 className="h-4 w-4 animate-spin" />
												) : client.referralData?.outreachClaimedBy ===
													session?.user?.name ? (
													"Unclaim"
												) : (
													"Claim"
												)}
											</Button>
										)}
										{isQsBackSection &&
											(onSchedulingTable ? (
												<TooltipProvider>
													<Tooltip>
														<TooltipTrigger asChild>
															<span className="inline-flex h-7 w-7 shrink-0 items-center justify-center">
																<CalendarCheck className="h-4 w-4 text-muted-foreground opacity-50" />
															</span>
														</TooltipTrigger>
														<TooltipContent>
															Already on scheduling page
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											) : (
												<Button
													className="shrink-0"
													disabled={addScheduling.isPending}
													onClick={() =>
														addScheduling.mutate({
															clientId: client.id,
															code:
																title === SECTION_DA_QS_DONE
																	? "90791"
																	: "96136",
														})
													}
													size="icon-sm"
													title="Add to Scheduling"
													variant="ghost"
												>
													{addScheduling.isPending &&
													addScheduling.variables?.clientId === client.id ? (
														<Loader2 className="h-4 w-4 animate-spin" />
													) : (
														<CalendarPlus className="h-4 w-4" />
													)}
												</Button>
											))}
									</div>
									{isSavedClient(client.hash) && (
										<button
											aria-label={`Remove ${client.fullName ?? punchClient["Client Name"]} as saved client for ${title}`}
											className="group relative flex w-full cursor-pointer items-center py-2"
											onClick={() => {
												if (savedPlaceKey) {
													deleteSavedPlace({ key: savedPlaceKey });
												}
											}}
											type="button"
										>
											<Separator className="my-2 flex-1 rounded bg-secondary data-[orientation=horizontal]:h-1" />
											<div className="pointer-events-none absolute top-1/2 right-0 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary px-2 py-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus:opacity-100">
												<PinOff className="h-4 w-4" />
											</div>
										</button>
									)}

									{index < clients.length - 1 &&
										savedPlaceKey &&
										!isSavedClient(client.hash) && (
											<button
												aria-label={`Set ${client.fullName ?? punchClient["Client Name"]} as saved client for ${title}`}
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
							);
						})}
					</div>
				</ScrollArea>
			</AccordionContent>
		</AccordionItem>
	);
}

export function Dashboard() {
	const can = useCheckPermission();
	const canInsuranceReview = can("clients:insurance:review");
	const { data: session } = useSession();

	const {
		data: dashboardData,
		isLoading,
		isError,
	} = api.google.getDashboardData.useQuery(undefined, {
		refetchInterval: 180000, // 3 minutes
	});

	const { data: insuranceReviewClients } =
		api.insuranceReview.getAllEnabled.useQuery(undefined, {
			enabled: canInsuranceReview,
		});

	const [showMineOnly, setShowMineOnly] = useState(false);
	const [insuranceFilters, setInsuranceFilters] = useState<string[]>([]);
	const showWaitingOnly = insuranceFilters.includes("waiting");
	const showHidden = insuranceFilters.includes("hidden");
	const visibleInsuranceClients = (insuranceReviewClients ?? []).filter((c) => {
		if (showMineOnly && c.claimedUserEmail !== session?.user?.email)
			return false;
		if (showWaitingOnly && !c.waiting) return false;
		if (showHidden !== c.paused) return false;
		return true;
	});

	const { data: schedulingData } = api.scheduling.get.useQuery(
		{},
		{
			staleTime: 60000,
		},
	);

	const scheduledClientIds = useMemo(() => {
		return new Set(schedulingData?.clients.map((c) => c.clientId) ?? []);
	}, [schedulingData]);

	const [openItems, setOpenItems] = useState<string[]>([]);
	const [isRestoring, setIsRestoring] = useState(true);

	useEffect(() => {
		const savedOpenItems = sessionStorage.getItem("dashboard-open-items");
		if (savedOpenItems) {
			try {
				setOpenItems(JSON.parse(savedOpenItems));
			} catch (e) {
				console.error("Failed to parse saved open items", e);
			}
		}

		const handleScroll = () => {
			// Only save if we are not currently in the restoration phase
			if (!isRestoring) {
				sessionStorage.setItem("dashboard-scroll-y", window.scrollY.toString());
			}
		};

		window.addEventListener("scroll", handleScroll);
		return () => window.removeEventListener("scroll", handleScroll);
	}, [isRestoring]);

	useEffect(() => {
		if (!isLoading && isRestoring) {
			const savedScroll = sessionStorage.getItem("dashboard-scroll-y");
			if (savedScroll) {
				const targetScroll = parseInt(savedScroll, 10);

				// Attempt to scroll multiple times as layout settles
				const scrollAttempts = [0, 100, 300, 600, 1000];
				const timeoutIds = scrollAttempts.map((delay, index) =>
					setTimeout(() => {
						window.scrollTo(0, targetScroll);
						// On the last attempt, mark restoration as complete
						if (index === scrollAttempts.length - 1) {
							setIsRestoring(false);
						}
					}, delay),
				);

				return () => {
					for (const id of timeoutIds) {
						clearTimeout(id);
					}
				};
			}
			setIsRestoring(false);
		}
	}, [isLoading, isRestoring]);

	const handleOpenItemsChange = (items: string[]) => {
		setOpenItems(items);
		sessionStorage.setItem("dashboard-open-items", JSON.stringify(items));
	};

	const finalSections = dashboardData?.sections ?? [];

	if (isLoading)
		return (
			<div className="mx-4 mt-8 flex grow flex-col items-center">
				<Skeleton className="h-[400px] w-full bg-muted md:w-1/2" />
			</div>
		);

	if (isError)
		return (
			<div className="mx-4 mt-8 flex grow flex-col items-center">Error</div>
		);

	return (
		<div className="mx-4 mt-8 flex grow flex-col items-center">
			<Accordion
				className="w-full md:w-1/2"
				onValueChange={handleOpenItemsChange}
				type="multiple"
				value={openItems}
			>
				{(dashboardData?.duplicatePunchClients?.length ?? 0) > 0 && (
					<Alert
						className="mb-4 border-destructive bg-destructive/10"
						variant="destructive"
					>
						<AlertTriangle className="h-4 w-4" />
						<AlertTitle>Duplicate Punchlist Entries</AlertTitle>
						<AlertDescription>
							The following clients appear more than once on the prioritization
							sheet and must be fixed:
							<ul className="mt-1 list-disc pl-4">
								{dashboardData?.duplicatePunchClients.map((c) => (
									<li key={c.hash}>
										<Link className="underline" href={`/clients/${c.hash}`}>
											{c.name}
										</Link>{" "}
										<span className="font-semibold">({c.count}×)</span>
									</li>
								))}
							</ul>
						</AlertDescription>
					</Alert>
				)}

				<p className="text-muted-foreground text-sm">
					Punchlist: {dashboardData?.punchlistCount ?? 0}
				</p>

				{finalSections.map((section) => (
					<Fragment key={section.title}>
						{section.subheading === "Records" &&
							canInsuranceReview &&
							(insuranceReviewClients?.length ?? 0) > 0 && (
								<>
									<h2 className="mt-6 mb-2 self-start font-bold text-lg">
										Insurance
									</h2>
									<AccordionItem value="insurance-review">
										<AccordionTrigger>
											<span className="flex items-center gap-1">
												Insurance Review
												<span className="text-muted-foreground text-sm">
													({visibleInsuranceClients.length})
												</span>
											</span>
										</AccordionTrigger>
										<AccordionContent>
											<div className="mb-2 flex flex-wrap items-center gap-2">
												<ToggleGroup
													onValueChange={(v) => setShowMineOnly(v === "mine")}
													size="sm"
													spacing={0}
													type="single"
													value={showMineOnly ? "mine" : "all"}
													variant="outline"
												>
													<ToggleGroupItem value="all">All</ToggleGroupItem>
													<ToggleGroupItem value="mine">Mine</ToggleGroupItem>
												</ToggleGroup>
												<div className="flex items-center gap-2">
													<Checkbox
														checked={showWaitingOnly}
														id="insurance-filter-waiting"
														onCheckedChange={(checked) =>
															setInsuranceFilters((prev) =>
																checked
																	? [...prev, "waiting"]
																	: prev.filter((v) => v !== "waiting"),
															)
														}
													/>
													<Label
														className="font-normal"
														htmlFor="insurance-filter-waiting"
													>
														Waiting
													</Label>
												</div>
												<div className="flex items-center gap-2">
													<Checkbox
														checked={showHidden}
														id="insurance-filter-hidden"
														onCheckedChange={(checked) =>
															setInsuranceFilters((prev) =>
																checked
																	? [...prev, "hidden"]
																	: prev.filter((v) => v !== "hidden"),
															)
														}
													/>
													<Label
														className="font-normal"
														htmlFor="insurance-filter-hidden"
													>
														Hidden from Review Lists
													</Label>
												</div>
											</div>
											<ScrollArea className="h-[400px] w-full rounded-md border bg-card text-card-foreground shadow-sm">
												<div className="p-4">
													{visibleInsuranceClients.map((c, index) => (
														<div key={c.clientHash}>
															<Link
																className="no-underline! hover:no-underline! flex items-center gap-2"
																href={`/clients/${c.clientHash}?tab=insurance`}
															>
																<span>
																	<Redact>{c.clientName}</Redact>
																</span>
																{c.waiting && (
																	<span className="rounded-sm bg-warning px-1 py-0.5 text-[10px] text-warning-foreground">
																		Waiting
																	</span>
																)}
																{c.claimedUserName && (
																	<span
																		className="rounded-sm px-1 py-0.5 text-[10px]"
																		style={userBadgeStyle(
																			c.claimedUserName.split(" ")[0] ??
																				c.claimedUserName,
																		)}
																	>
																		{c.claimedUserName.split(" ")[0]}
																	</span>
																)}
															</Link>
															{index < visibleInsuranceClients.length - 1 && (
																<Separator className="my-2" />
															)}
														</div>
													))}
												</div>
											</ScrollArea>
										</AccordionContent>
									</AccordionItem>
								</>
							)}
						{section.subheading && (
							<h2 className="mt-6 mb-2 self-start font-bold text-lg">
								{section.subheading}
							</h2>
						)}
						<PunchListAccordionItem
							clients={section.clients}
							description={section.description}
							key={section.title}
							scheduledClientIds={scheduledClientIds}
							title={section.title}
						/>
					</Fragment>
				))}
			</Accordion>
		</div>
	);
}

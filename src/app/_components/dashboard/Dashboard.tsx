"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { Button } from "@ui/button";
import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { CalendarPlus, FlaskConical, Loader2 } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	type DashboardClient,
	getDashboardSections,
	SECTION_DA_QS_DONE,
	SECTION_DAEVAL_QS_DONE,
	SECTION_EVAL_QS_DONE,
} from "~/lib/dashboard";
import type { FullClientInfo } from "~/lib/models";
import { api } from "~/trpc/react";

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
	const utils = api.useUtils();
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

	return (
		<AccordionItem value={title}>
			<AccordionTrigger>
				<span className="flex items-center gap-1">
					{title}
					<span className="text-muted-foreground text-sm">
						({clients?.length})
					</span>
				</span>
			</AccordionTrigger>
			<AccordionContent>
				{description && (
					<Alert className="mb-4">
						<AlertDescription>{description}</AlertDescription>
					</Alert>
				)}
				<ScrollArea className="h-[400px] w-full rounded-md border bg-card text-card-foreground shadow">
					<div className="p-4">
						{clients?.map((client, index) => {
							const punchClient = client as FullClientInfo & DashboardClient;
							const onSchedulingTable = scheduledClientIds?.has(client.id);

							return (
								<div key={client.hash}>
									<div className="flex items-center justify-between gap-4">
										<Link
											className="block grow"
											href={`/clients/${client.hash}`}
										>
											<div>
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-2">
														<span>
															{client.fullName ?? punchClient["Client Name"]}
														</span>
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
												{client.failures && client.failures.length > 0 && (
													<div className="mt-1">
														{client.failures.map((failure) => (
															<span
																className="mr-1 inline-block rounded-sm bg-destructive/10 px-1 py-0.5 text-[10px] text-destructive"
																key={failure.reason}
															>
																{failure.reason}
															</span>
														))}
													</div>
												)}
											</div>
										</Link>
										{isQsBackSection && !onSchedulingTable && (
											<Button
												className="shrink-0"
												disabled={addScheduling.isPending}
												onClick={() =>
													addScheduling.mutate({
														clientId: client.id,
														code:
															title === SECTION_EVAL_QS_DONE
																? "96136"
																: "90791",
														office:
															title === SECTION_EVAL_QS_DONE
																? undefined
																: "Virtual",
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
										)}
									</div>
									{index < clients.length - 1 && <Separator className="my-2" />}
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
	const {
		data: dashboardData,
		isLoading,
		isError,
	} = api.google.getDashboardData.useQuery(undefined, {
		refetchInterval: 30000, // 30 seconds
	});

	const { data: schedulingData } = api.scheduling.get.useQuery(undefined, {
		staleTime: 60000,
	});

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

	const finalSections = getDashboardSections(
		dashboardData?.punchClients,
		dashboardData?.missingClients,
	);

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
				<Alert className="mb-4">
					<FlaskConical />
					<AlertTitle>Beta</AlertTitle>
					<AlertDescription>
						Double-check that data is accurate, we're still working on this.
					</AlertDescription>
				</Alert>

				<p className="text-muted-foreground text-sm">
					Punchlist: {dashboardData?.punchClients?.length ?? 0}
				</p>

				{finalSections.map((section) => (
					<Fragment key={section.title}>
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

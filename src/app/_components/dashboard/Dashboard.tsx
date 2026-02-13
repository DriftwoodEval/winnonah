"use client";

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@ui/alert";
import { ScrollArea } from "@ui/scroll-area";
import { Separator } from "@ui/separator";
import { Skeleton } from "@ui/skeleton";
import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type DashboardClient, getDashboardSections } from "~/lib/dashboard";
import type { FullClientInfo } from "~/lib/models";
import { api } from "~/trpc/react";

interface PunchListAccordionProps {
	clients: DashboardClient[];
	title: string;
}

function PunchListAccordionItem({ clients, title }: PunchListAccordionProps) {
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
				<ScrollArea className="h-[400px] w-full rounded-md border bg-card text-card-foreground shadow">
					<div className="p-4">
						{clients?.map((client, index) => {
							const punchClient = client as FullClientInfo & DashboardClient;
							return (
								<div key={client.hash}>
									<Link
										className="block w-full"
										href={`/clients/${client.hash}`}
									>
										<div>
											<div className="flex items-center justify-between">
												<span>
													{client.fullName ?? punchClient["Client Name"]}
												</span>
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
					<PunchListAccordionItem
						clients={section.clients}
						key={section.title}
						title={section.title}
					/>
				))}
			</Accordion>
		</div>
	);
}

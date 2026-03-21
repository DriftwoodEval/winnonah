"use client";

import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import { Route } from "lucide-react";
import {
	getClientMatchedSections,
	SECTION_ACTIVE_NOT_ON_PUNCHLIST,
	SECTION_JUST_ADDED,
} from "~/lib/dashboard";
import type { Client, FullClientInfo } from "~/lib/models";
import { api } from "~/trpc/react";

export function DashboardStatus({ clientId }: { clientId: number }) {
	const { data: dashboardData, isLoading } =
		api.google.getDashboardData.useQuery(undefined, {
			staleTime: 60000,
		});

	const { data: needsReachOut } = api.clients.getNeedsReachOut.useQuery();
	const { data: needsReview } = api.clients.getNeedsReview.useQuery();

	if (isLoading) {
		return <Skeleton className="h-6 w-32" />;
	}

	const clientOnPunch = dashboardData?.punchClients?.find(
		(p: FullClientInfo) => p.id === clientId,
	);
	const clientMissing = dashboardData?.missingClients?.find(
		(m: Client) => m.id === clientId,
	);

	const isInReachOut = needsReachOut?.some((c) => c.id === clientId);
	const isInReview = needsReview?.some((c) => c.id === clientId);

	if (!clientOnPunch && !clientMissing && !isInReachOut && !isInReview) {
		return null;
	}

	const matchedSections = getClientMatchedSections(
		(clientOnPunch ?? clientMissing ?? { id: clientId }) as
			| FullClientInfo
			| Client,
		dashboardData?.punchClients ?? [],
		dashboardData?.missingClients ?? [],
		needsReachOut ?? [],
		needsReview ?? [],
	);

	if (matchedSections.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			<Route className="h-4 w-4 text-muted-foreground" />
			{matchedSections.map((section) => (
				<Badge
					key={section}
					variant={
						section === SECTION_ACTIVE_NOT_ON_PUNCHLIST ||
						section === SECTION_JUST_ADDED
							? "outline"
							: "secondary"
					}
				>
					{section}
				</Badge>
			))}
		</div>
	);
}

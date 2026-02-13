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
	const { data: punchClients, isLoading: isLoadingPunch } =
		api.google.getPunch.useQuery(undefined, {
			staleTime: 60000,
		});

	const { data: missingFromPunchlist, isLoading: isLoadingMissing } =
		api.google.getMissingFromPunchlist.useQuery(undefined, {
			staleTime: 60000,
		});

	if (isLoadingPunch || isLoadingMissing) {
		return <Skeleton className="h-6 w-32" />;
	}

	const clientOnPunch = punchClients?.find((p) => p.id === clientId);
	const clientMissing = missingFromPunchlist?.find((m) => m.id === clientId);

	if (!clientOnPunch && !clientMissing) {
		return null;
	}

	const matchedSections = getClientMatchedSections(
		(clientOnPunch ?? clientMissing) as FullClientInfo | Client,
		punchClients ?? [],
		missingFromPunchlist ?? [],
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

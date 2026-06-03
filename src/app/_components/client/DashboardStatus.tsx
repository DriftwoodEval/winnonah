"use client";

import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import { Route } from "lucide-react";
import {
	SECTION_ACTIVE_NOT_ON_PUNCHLIST,
	SECTION_JUST_ADDED,
} from "~/lib/dashboard";
import { api } from "~/trpc/react";

export function DashboardStatus({ clientId }: { clientId: number }) {
	const { data: dashboardData, isLoading } =
		api.google.getDashboardData.useQuery(undefined, {
			staleTime: 60000,
		});

	if (isLoading) {
		return <Skeleton className="h-6 w-32" />;
	}

	const matchedSections =
		dashboardData?.sections
			.filter((section) => section.clients.some((c) => c.id === clientId))
			.map((section) => section.title) ?? [];

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

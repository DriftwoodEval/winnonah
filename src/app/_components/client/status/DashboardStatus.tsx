"use client";

import { AddToSchedulingButton } from "@components/dashboard/AddToSchedulingButton";
import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import { Route } from "lucide-react";
import {
	isQsDoneSection,
	SECTION_ACTIVE_NOT_ON_PUNCHLIST,
	SECTION_JUST_ADDED,
} from "~/lib/dashboard";
import { api } from "~/trpc/react";

export function DashboardStatus({
	clientId,
	readOnly,
}: {
	clientId: number;
	readOnly?: boolean;
}) {
	const { data: dashboardData, isLoading } =
		api.google.getDashboardData.useQuery(undefined, {
			staleTime: 5 * 60 * 1000,
			refetchInterval: 5 * 60 * 1000,
		});
	const { data: schedulingData } = api.scheduling.get.useQuery(
		{},
		{ staleTime: 60000 },
	);

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

	const qsDoneSection = matchedSections.find(isQsDoneSection);
	const onSchedulingTable =
		schedulingData?.clients.some((c) => c.clientId === clientId) ?? false;

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
			{!readOnly && qsDoneSection && (
				<AddToSchedulingButton
					clientId={clientId}
					onSchedulingTable={onSchedulingTable}
					sectionTitle={qsDoneSection}
				/>
			)}
		</div>
	);
}

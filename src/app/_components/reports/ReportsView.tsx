"use client";

import ReportQueue from "@components/reports/ReportQueue";
import { ErrorState } from "@components/shared/ErrorState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { api } from "~/trpc/react";
import { ReportRowsSkeleton } from "./ReportRowsSkeleton";
import { ReportsTable } from "./ReportsTable";

function TabContent({ tab }: { tab: "active" | "archived" }) {
	const { data, isLoading, isError, refetch } = api.reports.list.useQuery({
		tab,
	});

	if (isLoading) {
		return <ReportRowsSkeleton />;
	}

	if (isError) {
		return <ErrorState onRetry={refetch} />;
	}

	const reports = data ?? [];

	return <ReportsTable reports={reports} tab={tab} />;
}

export function ReportsView() {
	const can = useCheckPermission();
	const { data: session } = useSession();
	// Archived reports are only listed for users who can see everyone's.
	const canViewAll = can("reports:view-all");
	const canApprove = can("reports:approve");
	// The claim toolbar is only useful to people who actually claim from the pool.
	const canClaim = (session?.user?.maxClaimedReports ?? 0) !== 0 || canApprove;

	const [tab, setTab] = useState<"active" | "archived">("active");

	return (
		<div className="flex w-full min-w-0 flex-col gap-4">
			<h1 className="text-xl font-semibold">Reports</h1>

			{canClaim && <ReportQueue className="w-full" />}

			{canViewAll ? (
				<Tabs
					onValueChange={(v) => setTab(v as "active" | "archived")}
					value={tab}
				>
					<TabsList>
						<TabsTrigger value="active">Active</TabsTrigger>
						<TabsTrigger value="archived">Archived</TabsTrigger>
					</TabsList>
					<TabsContent value="active">
						<TabContent tab="active" />
					</TabsContent>
					<TabsContent value="archived">
						<TabContent tab="archived" />
					</TabsContent>
				</Tabs>
			) : (
				<TabContent tab="active" />
			)}
		</div>
	);
}

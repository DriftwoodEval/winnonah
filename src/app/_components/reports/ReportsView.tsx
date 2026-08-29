"use client";

import { ClientSearchAndAdd } from "@components/clients/ClientSearchAndAdd";
import { Skeleton } from "@ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { api } from "~/trpc/react";
import { ReportsTable } from "./ReportsTable";

type Kind = "pool" | "self" | "all";

function TabContent({
	tab,
	kind,
	isApprover,
}: {
	tab: "active" | "archived";
	kind: Kind;
	isApprover: boolean;
}) {
	const { data, isLoading } = api.reports.list.useQuery({ tab, kind });

	if (isLoading) {
		return (
			<div className="flex w-full flex-col gap-2">
				{(["a", "b", "c", "d", "e"] as const).map((k) => (
					<Skeleton className="h-12 w-full rounded-md" key={k} />
				))}
			</div>
		);
	}

	return (
		<ReportsTable isApprover={isApprover} reports={data ?? []} tab={tab} />
	);
}

export function ReportsView() {
	const can = useCheckPermission();
	const isApprover = can("reports:approve") || can("reports:billing");
	const canApprove = can("reports:approve");

	const [tab, setTab] = useState<"active" | "archived">("active");
	const [kind, setKind] = useState<Kind>(isApprover ? "all" : "pool");

	const utils = api.useUtils();
	const addReport = api.reports.addManualReport.useMutation({
		onSuccess: () => {
			void utils.reports.list.invalidate();
			toast.success("Report added.");
		},
		onError: (err) =>
			toast.error("Could not add report", { description: err.message }),
	});

	return (
		<div className="flex w-full flex-col gap-4">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<h1 className="font-semibold text-xl">Reports</h1>
				<div className="w-full max-w-sm">
					<ClientSearchAndAdd
						addButtonLabel="Add report"
						floating
						isAdding={addReport.isPending}
						onAdd={(client) => addReport.mutate({ clientId: client.id })}
						placeholder="Add a report for a client..."
						resetOnAdd
					/>
				</div>
			</div>

			<div
				className={`flex-wrap items-center gap-2 ${isApprover ? "flex" : "hidden"}`}
			>
				{(["pool", "self", "all"] as const).map((k) => (
					<button
						className={`rounded-full border px-3 py-1 text-sm ${
							kind === k
								? "border-primary bg-primary text-primary-foreground"
								: "border-input text-muted-foreground"
						}`}
						key={k}
						onClick={() => setKind(k)}
						type="button"
					>
						{k === "pool"
							? "Pool reports"
							: k === "self"
								? "Self-written"
								: "All"}
					</button>
				))}
			</div>

			{canApprove ? (
				<Tabs
					onValueChange={(v) => setTab(v as "active" | "archived")}
					value={tab}
				>
					<TabsList>
						<TabsTrigger value="active">Active</TabsTrigger>
						<TabsTrigger value="archived">Archived</TabsTrigger>
					</TabsList>
					<TabsContent value="active">
						<TabContent isApprover={isApprover} kind={kind} tab="active" />
					</TabsContent>
					<TabsContent value="archived">
						<TabContent isApprover={isApprover} kind={kind} tab="archived" />
					</TabsContent>
				</Tabs>
			) : (
				<TabContent isApprover={isApprover} kind={kind} tab="active" />
			)}
		</div>
	);
}

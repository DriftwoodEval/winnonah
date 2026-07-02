"use client";

import { AuthRejection } from "@components/layout/AuthRejection";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Skeleton } from "@ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@ui/tabs";
import { Eye, EyeOff } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { api } from "~/trpc/react";
import { EvaluatorDashboardTable } from "./EvaluatorDashboardTable";

function TabContent({
	tab,
	isAdmin,
	preview = false,
}: {
	tab: "active" | "archived";
	isAdmin: boolean;
	preview?: boolean;
}) {
	const { data, isLoading } = api.evaluatorDashboard.getAppointments.useQuery({
		tab,
		preview,
	});

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
		<EvaluatorDashboardTable
			appointments={data ?? []}
			isAdmin={isAdmin}
			tab={tab}
		/>
	);
}

export function EvaluatorDashboard() {
	const can = useCheckPermission();
	const { data: session, status } = useSession();
	const isAdmin = can("evaluator-dashboard:admin");
	const isEvaluator = session?.user.isEvaluator ?? false;
	const [tab, setTab] = useState<"active" | "archived">("active");
	const [previewing, setPreviewing] = useState(false);

	const { data: config, error } = api.evaluatorDashboard.getConfig.useQuery(
		undefined,
		{ enabled: isAdmin || isEvaluator },
	);

	if (status === "loading") return null;

	if (!isAdmin && !isEvaluator) {
		return <AuthRejection reason="unauthorized" />;
	}

	if (error?.data?.code === "UNAUTHORIZED") {
		return <AuthRejection reason="unauthorized" />;
	}

	const title = config?.evaluatorFirstName
		? `${config.evaluatorFirstName}'s Report Dashboard`
		: "Report Dashboard";

	if (!isAdmin) {
		return (
			<div className="w-full">
				<h1 className="mb-3 font-bold text-2xl">{title}</h1>
				<TabContent isAdmin={false} tab="active" />
			</div>
		);
	}

	if (previewing) {
		return (
			<div className="w-full">
				<div className="mb-3 flex items-center gap-3">
					<h1 className="font-bold text-2xl">{title}</h1>
					<Badge variant="secondary">Evaluator Preview</Badge>
					<Button
						className="ml-auto"
						onClick={() => setPreviewing(false)}
						size="sm"
						variant="outline"
					>
						<EyeOff className="mr-1.5 h-4 w-4" />
						Exit Preview
					</Button>
				</div>
				<TabContent isAdmin={false} preview tab="active" />
			</div>
		);
	}

	return (
		<div className="w-full">
			<div className="mb-3 flex items-center gap-3">
				<h1 className="font-bold text-2xl">{title}</h1>
				{process.env.NODE_ENV === "development" && (
					<Button
						className="ml-auto"
						onClick={() => setPreviewing(true)}
						size="sm"
						variant="outline"
					>
						<Eye className="mr-1.5 h-4 w-4" />
						Preview as Evaluator
					</Button>
				)}
			</div>
			<Tabs
				onValueChange={(v) => setTab(v as "active" | "archived")}
				value={tab}
			>
				<TabsList>
					<TabsTrigger value="active">Active</TabsTrigger>
					<TabsTrigger value="archived">Archived</TabsTrigger>
				</TabsList>
				<TabsContent value="active">
					<TabContent isAdmin={isAdmin} tab="active" />
				</TabsContent>
				<TabsContent value="archived">
					<TabContent isAdmin={isAdmin} tab="archived" />
				</TabsContent>
			</Tabs>
		</div>
	);
}

"use client";

import { Badge } from "@ui/badge";
import { Skeleton } from "@ui/skeleton";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { formatInBusinessTime } from "~/lib/utils";
import { api } from "~/trpc/react";
import { PostVisitMessageButton } from "../appointments/PostVisitMessageButton";
import { PinListButton } from "../dashboard/PinListButton";
import { Redact } from "../redaction/Redact";
import { EmptyState } from "../shared/EmptyState";
import { ErrorState } from "../shared/ErrorState";

export function RecentClientsWidget() {
	const { data: session } = useSession();
	const {
		data: recentClients,
		isLoading,
		isError,
		refetch,
	} = api.users.getRecentClients.useQuery(undefined, { enabled: !!session });

	if (isLoading) {
		return (
			<div className="flex flex-wrap items-center gap-2 p-3">
				<Skeleton className="h-7 w-20" />
				<Skeleton className="h-7 w-28" />
				<Skeleton className="h-7 w-16" />
			</div>
		);
	}

	if (isError) {
		return <ErrorState compact onRetry={refetch} />;
	}

	if (!recentClients?.length) {
		return <EmptyState compact title="No recent clients" />;
	}

	return (
		<div className="flex flex-wrap items-center gap-2 overflow-auto p-3">
			<span className="text-muted-foreground text-xs uppercase tracking-wide">
				Recent
			</span>
			{recentClients.map((client) => (
				<Link
					className="shrink-0 whitespace-nowrap rounded-md border bg-background px-2.5 py-1 text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
					href={`/clients/${client.hash}`}
					key={client.hash}
				>
					<Redact>{client.name}</Redact>
				</Link>
			))}
		</div>
	);
}

export function MyInsuranceClientsWidget() {
	const can = useCheckPermission();
	const {
		data: clients,
		isLoading,
		isError,
		refetch,
	} = api.adminReview.getMyClaimedClients.useQuery(undefined, {
		enabled: can("clients:admin:review"),
	});

	if (!can("clients:admin:review")) return null;

	if (isLoading) {
		return (
			<div className="flex flex-wrap items-center gap-2 p-3">
				<Skeleton className="h-7 w-24" />
				<Skeleton className="h-7 w-20" />
				<Skeleton className="h-7 w-32" />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2 overflow-auto rounded-lg border border-destructive/20 bg-destructive/5 p-3">
			<div className="flex items-center justify-between gap-2">
				<span className="text-muted-foreground text-xs uppercase tracking-wide">
					My Admin Review Clients
				</span>
				<PinListButton pinned={{ kind: "adminReview" }} />
			</div>
			{isError ? (
				<ErrorState compact onRetry={refetch} />
			) : !clients?.length ? (
				<EmptyState compact title="No claimed admin review clients" />
			) : (
				<div className="flex flex-wrap items-center gap-2">
					{clients.map((c) => (
						<Link
							className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border bg-background px-2.5 py-1 text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
							href={`/clients/${c.clientHash}?tab=admin-review`}
							key={c.clientHash}
						>
							<Redact>{c.clientName}</Redact>
							{c.waiting && (
								<Badge className="" size="sm" variant="warning">
									Waiting
								</Badge>
							)}
						</Link>
					))}
				</div>
			)}
		</div>
	);
}

export function PostVisitMessagesWidget() {
	const { data, isLoading, isError, refetch } =
		api.appointments.getPostVisitMessageList.useQuery();

	// A client with several qualifying visits shows once, on the latest.
	const seen = new Set<string>();
	const rows = data?.filter(
		(r) => !seen.has(r.clientHash) && seen.add(r.clientHash),
	);

	return (
		<div className="flex h-full flex-col gap-2 overflow-auto rounded-lg border bg-card p-3">
			<span className="text-muted-foreground text-xs uppercase tracking-wide">
				Post-Visit TA Message
			</span>
			{isLoading ? (
				<Skeleton className="h-7 w-full" />
			) : isError ? (
				<ErrorState compact onRetry={refetch} />
			) : !rows?.length ? (
				<EmptyState compact title="Nobody is waiting on a message" />
			) : (
				rows.map((r) => (
					<div
						className="flex items-center justify-between gap-2"
						key={r.appointmentId}
					>
						<div className="flex flex-col">
							<Link
								className="text-sm hover:underline"
								href={`/clients/${r.clientHash}`}
							>
								<Redact>{r.clientName}</Redact>
							</Link>
							<span className="text-muted-foreground text-xs">
								{formatInBusinessTime(r.startTime, "MMM d")} with{" "}
								{r.evaluatorName}
							</span>
						</div>
						<PostVisitMessageButton appointmentId={r.appointmentId} />
					</div>
				))
			)}
		</div>
	);
}

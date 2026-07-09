"use client";

import { Skeleton } from "@ui/skeleton";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { api } from "~/trpc/react";

export function RecentClientsWidget() {
	const { data: session } = useSession();
	const { data: recentClients, isLoading } =
		api.users.getRecentClients.useQuery(undefined, { enabled: !!session });

	if (isLoading) {
		return (
			<div className="flex flex-wrap items-center gap-2 p-3">
				<Skeleton className="h-7 w-20" />
				<Skeleton className="h-7 w-28" />
				<Skeleton className="h-7 w-16" />
			</div>
		);
	}

	if (!recentClients?.length) {
		return (
			<p className="px-3 py-4 text-center text-muted-foreground text-sm">
				No recent clients
			</p>
		);
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
					{client.name}
				</Link>
			))}
		</div>
	);
}

export function MyInsuranceClientsWidget() {
	const can = useCheckPermission();
	const { data: clients, isLoading } =
		api.insuranceReview.getMyClaimedClients.useQuery(undefined, {
			enabled: can("clients:insurance:review"),
		});

	if (!can("clients:insurance:review")) return null;

	if (isLoading) {
		return (
			<div className="flex flex-wrap items-center gap-2 p-3">
				<Skeleton className="h-7 w-24" />
				<Skeleton className="h-7 w-20" />
				<Skeleton className="h-7 w-32" />
			</div>
		);
	}

	if (!clients?.length) {
		return (
			<p className="px-3 py-4 text-center text-muted-foreground text-sm">
				No claimed insurance clients
			</p>
		);
	}

	return (
		<div className="flex flex-wrap items-center gap-2 overflow-auto rounded-lg border border-destructive/20 bg-destructive/5 p-3">
			<span className="text-muted-foreground text-xs uppercase tracking-wide">
				My Insurance Clients
			</span>
			{clients.map((c) => (
				<Link
					className="shrink-0 whitespace-nowrap rounded-md border bg-background px-2.5 py-1 text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
					href={`/clients/${c.clientHash}?tab=insurance`}
					key={c.clientHash}
				>
					{c.clientName}
				</Link>
			))}
		</div>
	);
}

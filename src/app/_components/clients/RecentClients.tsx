"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";

export function RecentClients() {
	const { data: session } = useSession();
	const { data: recentClients } = api.users.getRecentClients.useQuery(
		undefined,
		{ enabled: !!session },
	);

	if (!recentClients?.length) return null;

	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="text-muted-foreground text-xs uppercase tracking-wide">
				Recent
			</span>
			{recentClients.map((client) => (
				<Link
					className="rounded-md border bg-background px-2.5 py-1 text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
					href={`/clients/${client.hash}`}
					key={client.hash}
				>
					{client.name}
				</Link>
			))}
		</div>
	);
}

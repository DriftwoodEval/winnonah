"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";

export function RecentClients({ onNavigate }: { onNavigate?: () => void }) {
	const { data: session } = useSession();
	const { data: recentClients } = api.users.getRecentClients.useQuery(
		undefined,
		{ enabled: !!session },
	);

	if (!recentClients?.length) return null;

	return (
		<div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
			<span className="text-muted-foreground text-xs uppercase tracking-wide">
				Recent
			</span>
			{recentClients.map((client) => (
				<Link
					className="rounded-md border bg-background px-2.5 py-1 text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
					href={`/clients/${client.hash}`}
					key={client.hash}
					onClick={onNavigate}
				>
					{client.name}
				</Link>
			))}
		</div>
	);
}

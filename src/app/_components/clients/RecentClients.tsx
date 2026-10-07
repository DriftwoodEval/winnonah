"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";
import { Redact } from "../redaction/Redact";

export function RecentClients({ onNavigate }: { onNavigate?: () => void }) {
	const { data: session } = useSession();
	const { data: recentClients } = api.users.getRecentClients.useQuery(
		undefined,
		{ enabled: !!session },
	);

	if (!recentClients?.length) return null;

	return (
		<div className="flex min-w-0 max-w-full shrink-0 snap-x items-center gap-2 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] md:rounded-lg md:border md:border-primary/20 md:bg-primary/5 md:px-3 md:py-2 [&::-webkit-scrollbar]:hidden">
			<span className="shrink-0 text-muted-foreground text-xs uppercase tracking-wide">
				Recent
			</span>
			{recentClients.map((client) => (
				<Link
					className="shrink-0 snap-start whitespace-nowrap rounded-full border bg-background px-3 py-1.5 text-sm shadow-xs hover:bg-accent hover:text-accent-foreground md:rounded-md md:px-2.5 md:py-1 dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
					href={`/clients/${client.hash}`}
					key={client.hash}
					onClick={onNavigate}
				>
					<Redact>{client.name}</Redact>
				</Link>
			))}
		</div>
	);
}

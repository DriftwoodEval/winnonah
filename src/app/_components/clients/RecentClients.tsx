"use client";

import { ClientHoverCard } from "@components/client/ClientHoverCard";
import { Redact } from "@components/redaction/Redact";
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
		<div className="flex max-w-full min-w-0 shrink-0 snap-x [scrollbar-width:none] items-center gap-2 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] md:rounded-lg md:border md:border-primary/20 md:bg-primary/5 md:px-3 md:py-2 [&::-webkit-scrollbar]:hidden">
			<span className="shrink-0 text-xs tracking-wide text-muted-foreground uppercase">
				Recent
			</span>
			{recentClients.map((client) => (
				<Link
					className="shrink-0 snap-start rounded-full border bg-background px-3 py-1.5 text-sm whitespace-nowrap shadow-xs hover:bg-accent hover:text-accent-foreground md:rounded-md md:px-2.5 md:py-1 dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
					href={`/clients/${client.hash}`}
					key={client.hash}
					onClick={onNavigate}
				>
					<ClientHoverCard clientHash={client.hash}>
						<Redact>{client.name}</Redact>
					</ClientHoverCard>
				</Link>
			))}
		</div>
	);
}

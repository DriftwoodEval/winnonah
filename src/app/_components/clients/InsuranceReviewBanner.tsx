"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";

export function InsuranceReviewBanner() {
	const { data: session } = useSession();
	const { data: claimed } = api.insuranceReview.getMyClaimedClients.useQuery(
		undefined,
		{ enabled: !!session },
	);

	if (!claimed?.length) return null;

	return (
		<div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
			<span className="text-muted-foreground text-xs uppercase tracking-wide">
				My Insurance Review Clients
			</span>
			{claimed.map((c) => (
				<Link
					className="rounded-md border bg-background px-2.5 py-1 text-sm shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
					href={`/clients/${c.clientHash}?tab=insurance`}
					key={c.clientHash}
				>
					{c.clientName}
				</Link>
			))}
		</div>
	);
}

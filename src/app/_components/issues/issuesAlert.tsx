"use client";

import { Badge } from "@ui/badge";
import Link from "next/link";
import { useIssueCounts } from "~/hooks/use-issue-counts";

export function IssuesAlert() {
	const counts = useIssueCounts({ staleTime: 1000 * 60 * 5 });

	const errorsLength = counts.reduce((sum, { count }) => sum + (count ?? 0), 0);

	if (errorsLength === 0) {
		return null;
	}

	return (
		<Badge asChild variant="destructive">
			<Link className="flex items-center gap-1" href="/issues">
				{errorsLength}{" "}
				<span className="hidden lg:inline">
					{errorsLength === 1 ? "issue" : "issues"}
				</span>
			</Link>
		</Badge>
	);
}

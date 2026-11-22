"use client";

import { Badge } from "@ui/badge";
import Link from "next/link";
import { api } from "~/trpc/react";

export function IssuesAlert() {
	const { data: errorsLength = 0 } = api.issues.getTotal.useQuery(undefined, {
		staleTime: 1000 * 60 * 5,
	});

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

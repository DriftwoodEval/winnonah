"use client";

import Link from "next/link";
import { Badge } from "~/app/_components/ui/badge";
import { api } from "~/trpc/react";
export function IssuesAlert() {
	const asanaErrorsResponse = api.clients.getAsanaErrors.useQuery();
	const asanaErrors = asanaErrorsResponse.data;

	const districtErrorsResponse = api.clients.getDistrictErrors.useQuery();
	const districtErrors = districtErrorsResponse.data;

	const archivedAsanaErrorsResponse =
		api.clients.getArchivedAsanaErrors.useQuery();
	const archivedAsanaErrors = archivedAsanaErrorsResponse.data;

	const babyNetErrorsResponse = api.clients.getBabyNetErrors.useQuery();
	const babyNetErrors = babyNetErrorsResponse.data;

	const errorsLength =
		(asanaErrors?.length ?? 0) +
		(districtErrors?.length ?? 0) +
		(archivedAsanaErrors?.length ?? 0) +
		(babyNetErrors?.length ?? 0);

	if (errorsLength === 0) {
		return null;
	}

	return (
		<Badge variant="destructive" asChild>
			<Link href="/issues" className="flex items-center gap-1">
				{errorsLength}{" "}
				<span className="hidden sm:inline">
					{errorsLength === 1 ? "issue" : "issues"}
				</span>
			</Link>
		</Badge>
	);
}

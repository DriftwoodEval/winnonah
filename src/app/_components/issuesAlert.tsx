"use client";

import Link from "next/link";
import { Button } from "~/app/_components/ui/button";
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
		<Link href="/issues">
			<Button className="rounded-full bg-destructive text-foreground">
				{errorsLength} issues
			</Button>
		</Link>
	);
}

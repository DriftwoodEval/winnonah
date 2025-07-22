"use client";

import { Badge } from "@components/ui/badge";
import { ClientLoadingContext } from "@context/ClientLoadingContext";
import Link from "next/link";
import { useContext } from "react";
import { api } from "~/trpc/react";
export function IssuesAlert() {
	const { isClientsLoaded } = useContext(ClientLoadingContext);

	const { data: asanaErrors } = api.clients.getAsanaErrors.useQuery(undefined, {
		enabled: isClientsLoaded,
	});

	const { data: districtErrors } = api.clients.getDistrictErrors.useQuery(
		undefined,
		{
			enabled: isClientsLoaded,
		},
	);

	const { data: archivedAsanaErrors } =
		api.clients.getArchivedAsanaErrors.useQuery(undefined, {
			enabled: isClientsLoaded,
		});

	const { data: babyNetErrors } = api.clients.getBabyNetErrors.useQuery(
		undefined,
		{
			enabled: isClientsLoaded,
		},
	);

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

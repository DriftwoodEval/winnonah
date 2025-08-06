"use client";

import { Badge } from "@components/ui/badge";
import { ClientLoadingContext } from "@context/ClientLoadingContext";
import Link from "next/link";
import { useContext } from "react";
import { api } from "~/trpc/react";
export function IssuesAlert() {
	const { isClientsLoaded } = useContext(ClientLoadingContext);

	const { data: districtErrors } = api.clients.getDistrictErrors.useQuery(
		undefined,
		{
			enabled: isClientsLoaded,
		},
	);

	const { data: babyNetErrors } = api.clients.getBabyNetErrors.useQuery(
		undefined,
		{
			enabled: isClientsLoaded,
		},
	);

	const { data: notInTAErrors } = api.clients.getNotInTAErrors.useQuery(
		undefined,
		{
			enabled: isClientsLoaded,
		},
	);

	const errorsLength =
		(districtErrors?.length ?? 0) +
		(babyNetErrors?.length ?? 0) +
		(notInTAErrors?.length ?? 0);

	if (errorsLength === 0) {
		return null;
	}

	return (
		<Badge asChild variant="destructive">
			<Link className="flex items-center gap-1" href="/issues">
				{errorsLength}{" "}
				<span className="hidden sm:inline">
					{errorsLength === 1 ? "issue" : "issues"}
				</span>
			</Link>
		</Badge>
	);
}

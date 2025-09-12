"use client";

import { Badge } from "@ui/badge";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "~/trpc/react";

export function IssuesAlert() {
	const [isReadyToFetch, setIsReadyToFetch] = useState(false);

	useEffect(() => {
		const timer = setTimeout(() => {
			setIsReadyToFetch(true);
		}, 2000); // 2 seconds

		return () => clearTimeout(timer);
	}, []);

	const queryOptions = {
		enabled: isReadyToFetch,
		staleTime: 1000 * 60 * 5, // 5 minutes
	};

	const { data: districtErrors } = api.clients.getDistrictErrors.useQuery(
		undefined,
		queryOptions,
	);

	const { data: babyNetErrors } = api.clients.getBabyNetErrors.useQuery(
		undefined,
		queryOptions,
	);

	const { data: notInTAErrors } = api.clients.getNotInTAErrors.useQuery(
		undefined,
		queryOptions,
	);

	const { data: noteOnlyClients } = api.clients.getNoteOnlyClients.useQuery(
		undefined,
		queryOptions,
	);

	const { data: noPaymentMethod } = api.clients.getNoPaymentMethod.useQuery(
		undefined,
		queryOptions,
	);

	const errorsLength =
		(districtErrors?.length ?? 0) +
		(babyNetErrors?.length ?? 0) +
		(notInTAErrors?.length ?? 0) +
		(noteOnlyClients?.length ?? 0) +
		(noPaymentMethod?.length ?? 0);

	if (!isReadyToFetch || errorsLength === 0) {
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

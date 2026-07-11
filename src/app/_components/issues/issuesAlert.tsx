"use client";

import { Badge } from "@ui/badge";
import Link from "next/link";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { api } from "~/trpc/react";

export function IssuesAlert() {
	const can = useCheckPermission();

	const queryOptions = {
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

	const { data: dropList } = api.clients.getDropList.useQuery(
		undefined,
		queryOptions,
	);

	const { data: autismStops } = api.clients.getAutismStops.useQuery(
		undefined,
		queryOptions,
	);

	const { data: pausedClients } = api.clients.getPaused.useQuery(
		undefined,
		queryOptions,
	);

	const { data: evaluationInProcess } =
		api.clients.getEvaluationInProcess.useQuery(undefined, queryOptions);

	const { data: noteOnlyClients } = api.clients.getNoteOnlyClients.useQuery(
		undefined,
		queryOptions,
	);

	const { data: duplicateFolderNames } = api.google.findDuplicates.useQuery(
		undefined,
		queryOptions,
	);

	const { data: noDriveIds } = api.clients.getNoDriveIdErrors.useQuery(
		undefined,
		queryOptions,
	);

	const { data: missingRecordsNeeded } =
		api.clients.getMissingRecordsNeeded.useQuery(undefined, queryOptions);

	const { data: dd4 } = api.clients.getDD4.useQuery(undefined, queryOptions);

	const { data: possiblePrivatePay } =
		api.clients.getPossiblePrivatePay.useQuery(undefined, queryOptions);

	const { data: unreviewedRecords } = api.clients.getUnreviewedRecords.useQuery(
		undefined,
		queryOptions,
	);

	const { data: duplicateQLinks } =
		api.questionnaires.getDuplicateLinks.useQuery(undefined, queryOptions);

	const { data: justAddedQuestionnaires } =
		api.questionnaires.getJustAdded.useQuery(undefined, queryOptions);

	const { data: partialBatteries } =
		api.questionnaires.getPartialBatteries.useQuery(undefined, queryOptions);

	const { data: punchlistIssues } = api.google.verifyPunchClients.useQuery();

	const clientsWithDuplicateLinks =
		duplicateQLinks?.duplicatePerClient
			.map((item) => item.client)
			.filter((client) => client !== undefined)
			.filter(
				(client, index, self) =>
					self.findIndex((c) => c.id === client.id) === index,
			) ?? [];

	const { data: noReferralSource } = api.clients.getNoReferralSource.useQuery(
		undefined,
		queryOptions,
	);

	const { data: missingAppointments } =
		api.clients.getMissingAppointments.useQuery(undefined, queryOptions);

	const { data: duplicateNames } = api.clients.getDuplicateNames.useQuery(
		undefined,
		queryOptions,
	);

	const countIf = (hasPermission: boolean, count: number = 0) =>
		hasPermission ? count : 0;

	const errorsLength =
		countIf(can("issues:dd4"), dd4?.length ?? 0) +
		countIf(can("issues:just-added"), justAddedQuestionnaires?.length ?? 0) +
		countIf(can("issues:paused-clients"), pausedClients?.length ?? 0) +
		countIf(
			can("issues:evaluation-in-process"),
			evaluationInProcess?.length ?? 0,
		) +
		countIf(can("issues:autism-stops"), autismStops?.length ?? 0) +
		countIf(
			can("issues:clients-not-in-db"),
			punchlistIssues?.clientsNotInDb.length ?? 0,
		) +
		countIf(
			can("issues:punchlist-inactive"),
			punchlistIssues?.inactiveClients.length ?? 0,
		) +
		countIf(
			can("issues:punchlist-duplicates"),
			punchlistIssues?.duplicateIdClients.length ?? 0,
		) +
		countIf(can("issues:no-referral-source"), noReferralSource?.length ?? 0) +
		countIf(
			can("issues:district-issues"),
			districtErrors?.clientsWithoutDistrict.length ?? 0,
		) +
		countIf(
			can("issues:district-issues"),
			districtErrors?.clientsWithPoorAddressLookup.length ?? 0,
		) +
		countIf(can("issues:babynet-ageout"), babyNetErrors?.length ?? 0) +
		countIf(can("issues:not-in-ta"), notInTAErrors?.length ?? 0) +
		countIf(can("issues:droplist"), dropList?.length ?? 0) +
		countIf(can("clients:merge"), noteOnlyClients?.length ?? 0) +
		countIf(can("issues:no-drive-ids"), noDriveIds?.length ?? 0) +
		countIf(can("issues:private-pay"), possiblePrivatePay?.length ?? 0) +
		countIf(
			can("issues:missing-records-needed"),
			missingRecordsNeeded?.length ?? 0,
		) +
		countIf(can("issues:unreviewed-records"), unreviewedRecords?.length ?? 0) +
		countIf(
			can("issues:duplicate-drive"),
			duplicateFolderNames?.data.length ?? 0,
		) +
		countIf(
			can("issues:duplicate-questionnaires"),
			clientsWithDuplicateLinks.length +
				(duplicateQLinks?.sharedAcrossClients.length ?? 0),
		) +
		countIf(
			can("issues:missing-appointments"),
			missingAppointments?.length ?? 0,
		) +
		countIf(
			can("issues:duplicate-names"),
			duplicateNames?.reduce((sum, g) => sum + g.pairs.length, 0) ?? 0,
		) +
		countIf(
			can("issues:partial-battery"),
			new Set(partialBatteries?.map((b) => b.id)).size,
		);

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

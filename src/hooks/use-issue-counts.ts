import { useCheckPermission } from "~/hooks/use-check-permission";
import { buildIssueCounts, type IssueCount } from "~/lib/issues/issue-counts";
import { api } from "~/trpc/react";

interface IssueCountQueryOptions {
	staleTime?: number;
	refetchInterval?: number;
}

/**
 * Item counts for every issue list the user has permission to see, keyed by
 * the list's title on the Issues page. Queries share cache entries with the
 * Issues page lists, so calling this alongside them adds no extra requests.
 */
export function useIssueCounts(
	options: IssueCountQueryOptions = {},
): IssueCount[] {
	const can = useCheckPermission();
	const query = (enabled: boolean) => ({ ...options, enabled });

	const { data: districtErrors } = api.clients.getDistrictErrors.useQuery(
		undefined,
		query(can("issues:district-issues")),
	);
	const { data: babyNetErrors } = api.clients.getBabyNetErrors.useQuery(
		undefined,
		query(can("issues:babynet-ageout")),
	);
	const { data: adultClients } = api.clients.getAdultClients.useQuery(
		undefined,
		query(can("issues:adult-clients")),
	);
	const { data: notInTAErrors } = api.clients.getNotInTAErrors.useQuery(
		undefined,
		query(can("issues:not-in-ta")),
	);
	const { data: dropList } = api.clients.getDropList.useQuery(
		undefined,
		query(can("issues:droplist")),
	);
	const { data: autismStops } = api.clients.getAutismStops.useQuery(
		undefined,
		query(can("issues:autism-stops")),
	);
	const { data: pausedClients } = api.clients.getPaused.useQuery(
		undefined,
		query(can("issues:paused-clients")),
	);
	const { data: evaluationInProcess } =
		api.clients.getEvaluationInProcess.useQuery(
			undefined,
			query(can("issues:evaluation-in-process")),
		);
	const { data: notesOnlyClients } = api.clients.getNotesOnlyClients.useQuery(
		undefined,
		query(can("clients:merge")),
	);
	const { data: duplicateFolderNames } = api.google.findDuplicates.useQuery(
		undefined,
		query(can("issues:duplicate-drive")),
	);
	const { data: noDriveIds } = api.clients.getNoDriveIdErrors.useQuery(
		undefined,
		query(can("issues:no-drive-ids")),
	);
	const { data: dd4 } = api.clients.getDD4.useQuery(
		undefined,
		query(can("issues:dd4")),
	);
	const { data: possiblePrivatePay } =
		api.clients.getPossiblePrivatePay.useQuery(
			undefined,
			query(can("issues:private-pay")),
		);
	const { data: unreviewedRecords } = api.clients.getUnreviewedRecords.useQuery(
		undefined,
		query(can("issues:unreviewed-records")),
	);
	const { data: unconfirmedCharterSchool } =
		api.clients.getUnconfirmedCharterSchool.useQuery(
			undefined,
			query(can("issues:charter-school-confirm")),
		);
	const { data: insuranceMismatch } = api.clients.getInsuranceMismatch.useQuery(
		undefined,
		query(can("issues:insurance-mismatch")),
	);
	const { data: specialAccommodations } =
		api.clients.getSpecialAccommodations.useQuery(
			undefined,
			query(can("issues:special-accommodations")),
		);
	const { data: ddsRequests } = api.clients.getDdsRequests.useQuery(
		undefined,
		query(can("issues:dds-requests")),
	);
	const { data: medicaidNotFound } = api.clients.getMedicaidNotFound.useQuery(
		undefined,
		query(can("issues:insurance-mismatch")),
	);
	const { data: duplicateQLinks } =
		api.questionnaires.getDuplicateLinks.useQuery(
			undefined,
			query(can("issues:duplicate-questionnaires")),
		);
	const { data: justAddedQuestionnaires } =
		api.questionnaires.getJustAdded.useQuery(
			undefined,
			query(can("issues:just-added")),
		);
	const { data: partialBatteries } =
		api.questionnaires.getPartialBatteries.useQuery(
			undefined,
			query(can("issues:partial-battery")),
		);
	const { data: punchlistIssues } = api.google.verifyPunchClients.useQuery(
		undefined,
		query(
			can("issues:clients-not-in-db") ||
				can("issues:punchlist-inactive") ||
				can("issues:punchlist-duplicates"),
		),
	);
	const { data: noReferralSource } = api.clients.getNoReferralSource.useQuery(
		undefined,
		query(can("issues:no-referral-source")),
	);
	const { data: missingAppointments } =
		api.clients.getMissingAppointments.useQuery(
			undefined,
			query(can("issues:missing-appointments")),
		);
	const { data: duplicateNames } = api.clients.getDuplicateNames.useQuery(
		undefined,
		query(can("issues:duplicate-names")),
	);

	return buildIssueCounts(
		{
			dd4,
			justAdded: justAddedQuestionnaires,
			paused: pausedClients,
			evaluationInProcess,
			missingAppointments,
			autismStops,
			punchlist: punchlistIssues,
			noReferralSource,
			districtErrors,
			babyNetErrors,
			adultClients,
			notInTA: notInTAErrors,
			dropList,
			notesOnly: notesOnlyClients,
			noDriveIds,
			possiblePrivatePay,
			unreviewedRecords,
			charterSchool: unconfirmedCharterSchool,
			insuranceMismatch,
			specialAccommodations,
			ddsRequests,
			medicaidNotFound,
			duplicateFolders: duplicateFolderNames,
			duplicateLinks: duplicateQLinks,
			duplicateNames,
			partialBatteries,
		},
		can,
	);
}

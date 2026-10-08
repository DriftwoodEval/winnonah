import { useCheckPermission } from "~/hooks/use-check-permission";
import { api } from "~/trpc/react";

export interface IssueCount {
	title: string;
	/** Undefined when the user can't see the list or its data hasn't loaded. */
	count: number | undefined;
}

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

	const clientsWithDuplicateLinks =
		duplicateQLinks &&
		new Set(
			duplicateQLinks.duplicatePerClient
				.map((item) => item.client?.id)
				.filter((id) => id !== undefined),
		).size;

	return [
		{ title: "In DD4", count: dd4?.length },
		{
			title: "Just Added Questionnaires",
			count: justAddedQuestionnaires?.length,
		},
		{ title: "Paused Clients", count: pausedClients?.length },
		{ title: "Evaluation In Process", count: evaluationInProcess?.length },
		{ title: "Appointments to be Created", count: missingAppointments?.length },
		{ title: "Autism Stops", count: autismStops?.length },
		{
			title: "Punchlist Clients Not In DB",
			count: can("issues:clients-not-in-db")
				? punchlistIssues?.clientsNotInDb.length
				: undefined,
		},
		{
			title: "Punchlist Clients Inactive",
			count: can("issues:punchlist-inactive")
				? punchlistIssues?.inactiveClients.length
				: undefined,
		},
		{
			title: "Duplicate Punchlist IDs",
			count: can("issues:punchlist-duplicates")
				? punchlistIssues?.duplicateIdClients.length
				: undefined,
		},
		{ title: "No Referral Source", count: noReferralSource?.length },
		{
			title: "Missing Districts",
			count: districtErrors?.clientsWithoutDistrict.length,
		},
		{
			title: "Poor Address Lookup",
			count: districtErrors?.clientsWithPoorAddressLookup.length,
		},
		{ title: "Too Old for BabyNet", count: babyNetErrors?.length },
		{ title: "Not in TA", count: notInTAErrors?.length },
		{ title: "Drop List", count: dropList?.length },
		{ title: "Notes Only", count: notesOnlyClients?.length },
		{ title: "No Drive IDs", count: noDriveIds?.length },
		{ title: "Potential Private Pay", count: possiblePrivatePay?.length },
		{
			title: "Unreviewed/Unreceived Records",
			count: unreviewedRecords?.length,
		},
		{
			title: "Charter School Awaiting Confirmation",
			count: unconfirmedCharterSchool?.length,
		},
		{ title: "Insurance Doesn't Match", count: insuranceMismatch?.length },
		{
			title: "Duplicate Drive Folders",
			count: duplicateFolderNames?.data.length,
		},
		{
			title: "Clients with Duplicate Questionnaire Links",
			count: clientsWithDuplicateLinks,
		},
		{
			title: "Clients Sharing Questionnaires",
			count: duplicateQLinks?.sharedAcrossClients.length,
		},
		{
			title: "Duplicate Client Names",
			count: duplicateNames?.reduce((sum, g) => sum + g.pairs.length, 0),
		},
		{
			title: "Partial Questionnaire Batteries",
			count:
				partialBatteries && new Set(partialBatteries.map((b) => b.id)).size,
		},
	];
}

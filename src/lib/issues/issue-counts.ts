import { ISSUE_TITLES } from "~/lib/issues/issue-titles";
import type { PermissionId } from "~/lib/types";
import type { RouterOutputs } from "~/trpc/react";

type Clients = RouterOutputs["clients"];

export interface IssueCount {
	title: string;
	/** Undefined when the user can't see the list or its data hasn't loaded. */
	count: number | undefined;
}

/** The raw result of each issue list procedure; a list is undefined until loaded. */
export interface IssueListData {
	dd4?: Clients["getDD4"];
	justAdded?: RouterOutputs["questionnaires"]["getJustAdded"];
	paused?: Clients["getPaused"];
	evaluationInProcess?: Clients["getEvaluationInProcess"];
	missingAppointments?: Clients["getMissingAppointments"];
	autismStops?: Clients["getAutismStops"];
	punchlist?: RouterOutputs["google"]["verifyPunchClients"];
	noReferralSource?: Clients["getNoReferralSource"];
	districtErrors?: Clients["getDistrictErrors"];
	babyNetErrors?: Clients["getBabyNetErrors"];
	adultClients?: Clients["getAdultClients"];
	notInTA?: Clients["getNotInTAErrors"];
	dropList?: Clients["getDropList"];
	notesOnly?: Clients["getNotesOnlyClients"];
	noDriveIds?: Clients["getNoDriveIdErrors"];
	possiblePrivatePay?: Clients["getPossiblePrivatePay"];
	unreviewedRecords?: Clients["getUnreviewedRecords"];
	charterSchool?: Clients["getUnconfirmedCharterSchool"];
	insuranceMismatch?: Clients["getInsuranceMismatch"];
	specialAccommodations?: Clients["getSpecialAccommodations"];
	ddsRequests?: Clients["getDdsRequests"];
	medicaidNotFound?: Clients["getMedicaidNotFound"];
	duplicateFolders?: RouterOutputs["google"]["findDuplicates"];
	duplicateLinks?: RouterOutputs["questionnaires"]["getDuplicateLinks"];
	duplicateNames?: Clients["getDuplicateNames"];
	partialBatteries?: RouterOutputs["questionnaires"]["getPartialBatteries"];
}

/** Turns raw issue list data into one count per list, titled as on the Issues page. */
export function buildIssueCounts(
	data: IssueListData,
	can: (id: PermissionId) => boolean,
): IssueCount[] {
	const clientsWithDuplicateLinks =
		data.duplicateLinks &&
		new Set(
			data.duplicateLinks.duplicatePerClient
				.map((item) => item.client?.id)
				.filter((id) => id !== undefined),
		).size;

	return [
		{ title: ISSUE_TITLES.dd4, count: data.dd4?.length },
		{
			title: ISSUE_TITLES.justAddedQuestionnaires,
			count: data.justAdded?.length,
		},
		{ title: ISSUE_TITLES.pausedClients, count: data.paused?.length },
		{
			title: ISSUE_TITLES.evaluationInProcess,
			count: data.evaluationInProcess?.length,
		},
		{
			title: ISSUE_TITLES.missingAppointments,
			count: data.missingAppointments?.length,
		},
		{ title: ISSUE_TITLES.autismStops, count: data.autismStops?.length },
		{
			title: ISSUE_TITLES.punchlistNotInDb,
			count: can("issues:clients-not-in-db")
				? data.punchlist?.clientsNotInDb.length
				: undefined,
		},
		{
			title: ISSUE_TITLES.punchlistInactive,
			count: can("issues:punchlist-inactive")
				? data.punchlist?.inactiveClients.length
				: undefined,
		},
		{
			title: ISSUE_TITLES.punchlistDuplicateIds,
			count: can("issues:punchlist-duplicates")
				? data.punchlist?.duplicateIdClients.length
				: undefined,
		},
		{
			title: ISSUE_TITLES.noReferralSource,
			count: data.noReferralSource?.length,
		},
		{
			title: ISSUE_TITLES.missingDistricts,
			count: data.districtErrors?.clientsWithoutDistrict.length,
		},
		{
			title: ISSUE_TITLES.poorAddressLookup,
			count: data.districtErrors?.clientsWithPoorAddressLookup.length,
		},
		{ title: ISSUE_TITLES.babyNetAgeOut, count: data.babyNetErrors?.length },
		{ title: ISSUE_TITLES.adultClients, count: data.adultClients?.length },
		{ title: ISSUE_TITLES.notInTA, count: data.notInTA?.length },
		{ title: ISSUE_TITLES.dropList, count: data.dropList?.length },
		{ title: ISSUE_TITLES.notesOnly, count: data.notesOnly?.length },
		{ title: ISSUE_TITLES.noDriveIds, count: data.noDriveIds?.length },
		{
			title: ISSUE_TITLES.possiblePrivatePay,
			count: data.possiblePrivatePay?.length,
		},
		{
			title: ISSUE_TITLES.unreviewedRecords,
			count: data.unreviewedRecords?.length,
		},
		{
			title: ISSUE_TITLES.charterSchoolConfirm,
			count: data.charterSchool?.length,
		},
		{
			title: ISSUE_TITLES.insuranceMismatch,
			count: data.insuranceMismatch?.length,
		},
		{
			title: ISSUE_TITLES.specialAccommodations,
			count: data.specialAccommodations?.length,
		},
		{ title: ISSUE_TITLES.ddsRequests, count: data.ddsRequests?.length },
		{
			title: ISSUE_TITLES.medicaidNotFound,
			count: data.medicaidNotFound?.length,
		},
		{
			title: ISSUE_TITLES.duplicateDriveFolders,
			count: data.duplicateFolders?.data.length,
		},
		{
			title: ISSUE_TITLES.duplicateQuestionnaireLinks,
			count: clientsWithDuplicateLinks,
		},
		{
			title: ISSUE_TITLES.sharedQuestionnaires,
			count: data.duplicateLinks?.sharedAcrossClients.length,
		},
		{
			title: ISSUE_TITLES.duplicateNames,
			count: data.duplicateNames?.reduce((sum, g) => sum + g.pairs.length, 0),
		},
		{
			title: ISSUE_TITLES.partialBatteries,
			count:
				data.partialBatteries &&
				new Set(data.partialBatteries.map((b) => b.id)).size,
		},
	];
}

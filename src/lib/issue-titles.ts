import type { PermissionId } from "~/lib/types";

/** Display titles of the Issues page lists, shared by the lists and their counts. */
export const ISSUE_TITLES = {
	dd4: "In DD4",
	justAddedQuestionnaires: "Just Added Questionnaires",
	pausedClients: "Paused Clients",
	evaluationInProcess: "Evaluation In Process",
	missingAppointments: "Appointments to be Created",
	autismStops: "Autism Stops",
	punchlistNotInDb: "Punchlist Clients Not In DB",
	punchlistInactive: "Punchlist Clients Inactive",
	punchlistDuplicateIds: "Duplicate Punchlist IDs",
	noReferralSource: "No Referral Source",
	missingDistricts: "Missing Districts",
	poorAddressLookup: "Poor Address Lookup",
	babyNetAgeOut: "Too Old for BabyNet",
	notInTA: "Not in TA",
	dropList: "Drop List",
	notesOnly: "Notes Only",
	noDriveIds: "No Drive IDs",
	possiblePrivatePay: "Potential Private Pay",
	unreviewedRecords: "Unreviewed/Unreceived Records",
	charterSchoolConfirm: "Charter School Awaiting Confirmation",
	insuranceMismatch: "Insurance Doesn't Match",
	duplicateDriveFolders: "Duplicate Drive Folders",
	duplicateQuestionnaireLinks: "Clients with Duplicate Questionnaire Links",
	sharedQuestionnaires: "Clients Sharing Questionnaires",
	duplicateNames: "Duplicate Client Names",
	partialBatteries: "Partial Questionnaire Batteries",
} as const;

export type IssueListId = keyof typeof ISSUE_TITLES;

export const ISSUE_LIST_IDS = Object.keys(ISSUE_TITLES) as IssueListId[];

/** Permission that gates each Issues page list, for the reorder customizer. */
export const ISSUE_LIST_PERMISSIONS: Record<IssueListId, PermissionId> = {
	dd4: "issues:dd4",
	justAddedQuestionnaires: "issues:just-added",
	pausedClients: "issues:paused-clients",
	evaluationInProcess: "issues:evaluation-in-process",
	missingAppointments: "issues:missing-appointments",
	autismStops: "issues:autism-stops",
	punchlistNotInDb: "issues:clients-not-in-db",
	punchlistInactive: "issues:punchlist-inactive",
	punchlistDuplicateIds: "issues:punchlist-duplicates",
	noReferralSource: "issues:no-referral-source",
	missingDistricts: "issues:district-issues",
	poorAddressLookup: "issues:district-issues",
	babyNetAgeOut: "issues:babynet-ageout",
	notInTA: "issues:not-in-ta",
	dropList: "issues:droplist",
	notesOnly: "clients:merge",
	noDriveIds: "issues:no-drive-ids",
	possiblePrivatePay: "issues:private-pay",
	unreviewedRecords: "issues:unreviewed-records",
	charterSchoolConfirm: "issues:charter-school-confirm",
	insuranceMismatch: "issues:insurance-mismatch",
	duplicateDriveFolders: "issues:duplicate-drive",
	duplicateQuestionnaireLinks: "issues:duplicate-questionnaires",
	sharedQuestionnaires: "issues:duplicate-questionnaires",
	duplicateNames: "issues:duplicate-names",
	partialBatteries: "issues:partial-battery",
};

/** Default order for lists with no saved preference: alphabetical by title. */
export const DEFAULT_ISSUE_LIST_ORDER: IssueListId[] = [...ISSUE_LIST_IDS].sort(
	(a, b) => ISSUE_TITLES[a].localeCompare(ISSUE_TITLES[b]),
);

/**
 * Combines a user's saved list order with the current set of lists: known
 * ids keep their saved position, lists added since the save land at the end
 * in default order, and ids for lists that no longer exist are dropped.
 */
export function mergeIssueListOrder(stored: unknown) {
	const known = new Set<string>(ISSUE_LIST_IDS);
	const seen = new Set<string>();
	const saved = (Array.isArray(stored) ? stored : []).filter(
		(id): id is IssueListId => {
			if (typeof id !== "string" || !known.has(id) || seen.has(id)) {
				return false;
			}
			seen.add(id);
			return true;
		},
	);
	const missing = DEFAULT_ISSUE_LIST_ORDER.filter((id) => !seen.has(id));
	return [...saved, ...missing];
}

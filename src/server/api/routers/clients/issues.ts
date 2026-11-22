import { fetchIssueList } from "~/lib/cache";
import {
	buildIssueCounts,
	type IssueListData,
} from "~/lib/issues/issue-counts";
import type { PermissionId } from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import { googleRouter } from "~/server/api/routers/admin/google";
import { clientRouter } from "~/server/api/routers/clients/client";
import { questionnaireRouter } from "~/server/api/routers/clients/questionnaires";
import {
	createCallerFactory,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";

// A caller over just the routers that hold issue lists. Importing the full
// app router here would be a circular import.
const createListCaller = createCallerFactory(
	createTRPCRouter({
		clients: clientRouter,
		google: googleRouter,
		questionnaires: questionnaireRouter,
	}),
);

export const issuesRouter = createTRPCRouter({
	/**
	 * Total issue count for the header badge. Runs the same list procedures as
	 * the Issues page for the lists the user may see, reuses their cached
	 * results, and caches the total so a page load makes one cheap request.
	 */
	getTotal: protectedProcedure.query(async ({ ctx }) => {
		const perms = ctx.session.user.permissions;
		const can = (id: PermissionId) => hasPermission(perms, id);
		const permissionKey = Object.entries(perms)
			.filter(([, allowed]) => allowed)
			.map(([id]) => id)
			.sort()
			.join(",");

		return fetchIssueList(ctx, `total:${permissionKey}`, async () => {
			const caller = createListCaller(ctx);
			// Lists the user may not see stay undefined and count as zero.
			const load = <T>(allowed: boolean, run: () => Promise<T>) =>
				allowed ? run() : Promise.resolve(undefined);

			const [
				districtErrors,
				babyNetErrors,
				adultClients,
				notInTA,
				dropList,
				autismStops,
				paused,
				evaluationInProcess,
				notesOnly,
				duplicateFolders,
				noDriveIds,
				dd4,
				possiblePrivatePay,
				unreviewedRecords,
				charterSchool,
				insuranceMismatch,
				specialAccommodations,
				ddsRequests,
				medicaidNotFound,
				duplicateLinks,
				justAdded,
				partialBatteries,
				punchlist,
				noReferralSource,
				missingAppointments,
				duplicateNames,
			] = await Promise.all([
				load(can("issues:district-issues"), () =>
					caller.clients.getDistrictErrors(),
				),
				load(can("issues:babynet-ageout"), () =>
					caller.clients.getBabyNetErrors(),
				),
				load(can("issues:adult-clients"), () =>
					caller.clients.getAdultClients(),
				),
				load(can("issues:not-in-ta"), () => caller.clients.getNotInTAErrors()),
				load(can("issues:droplist"), () => caller.clients.getDropList()),
				load(can("issues:autism-stops"), () => caller.clients.getAutismStops()),
				load(can("issues:paused-clients"), () => caller.clients.getPaused()),
				load(can("issues:evaluation-in-process"), () =>
					caller.clients.getEvaluationInProcess(),
				),
				load(can("clients:merge"), () => caller.clients.getNotesOnlyClients()),
				load(can("issues:duplicate-drive"), () =>
					caller.google.findDuplicates(),
				),
				load(can("issues:no-drive-ids"), () =>
					caller.clients.getNoDriveIdErrors(),
				),
				load(can("issues:dd4"), () => caller.clients.getDD4()),
				load(can("issues:private-pay"), () =>
					caller.clients.getPossiblePrivatePay(),
				),
				load(can("issues:unreviewed-records"), () =>
					caller.clients.getUnreviewedRecords(),
				),
				load(can("issues:charter-school-confirm"), () =>
					caller.clients.getUnconfirmedCharterSchool(),
				),
				load(can("issues:insurance-mismatch"), () =>
					caller.clients.getInsuranceMismatch(),
				),
				load(can("issues:special-accommodations"), () =>
					caller.clients.getSpecialAccommodations(),
				),
				load(can("issues:dds-requests"), () => caller.clients.getDdsRequests()),
				load(can("issues:insurance-mismatch"), () =>
					caller.clients.getMedicaidNotFound(),
				),
				load(can("issues:duplicate-questionnaires"), () =>
					caller.questionnaires.getDuplicateLinks(),
				),
				load(can("issues:just-added"), () =>
					caller.questionnaires.getJustAdded(),
				),
				load(can("issues:partial-battery"), () =>
					caller.questionnaires.getPartialBatteries(),
				),
				load(
					can("issues:clients-not-in-db") ||
						can("issues:punchlist-inactive") ||
						can("issues:punchlist-duplicates"),
					() => caller.google.verifyPunchClients(),
				),
				load(can("issues:no-referral-source"), () =>
					caller.clients.getNoReferralSource(),
				),
				load(can("issues:missing-appointments"), () =>
					caller.clients.getMissingAppointments(),
				),
				load(can("issues:duplicate-names"), () =>
					caller.clients.getDuplicateNames(),
				),
			]);

			const data: IssueListData = {
				districtErrors,
				babyNetErrors,
				adultClients,
				notInTA,
				dropList,
				autismStops,
				paused,
				evaluationInProcess,
				notesOnly,
				duplicateFolders,
				noDriveIds,
				dd4,
				possiblePrivatePay,
				unreviewedRecords,
				charterSchool,
				insuranceMismatch,
				specialAccommodations,
				ddsRequests,
				medicaidNotFound,
				duplicateLinks,
				justAdded,
				partialBatteries,
				punchlist,
				noReferralSource,
				missingAppointments,
				duplicateNames,
			};
			return buildIssueCounts(data, can).reduce(
				(sum, { count }) => sum + (count ?? 0),
				0,
			);
		});
	}),
});

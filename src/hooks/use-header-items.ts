import { useSession } from "next-auth/react";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { HEADER_ITEM_DEFS, type HeaderItemId } from "~/lib/layout/header-items";
import type { PermissionId } from "~/lib/types";
import { api } from "~/trpc/react";

const ITEM_PERMISSIONS: Partial<Record<HeaderItemId, PermissionId>> = {
	dashboard: "pages:dashboard",
	availability: "pages:availability",
	scheduling: "pages:scheduling",
	"scheduling-helper": "pages:scheduling-helper",
	"fax-categorization": "fax:categorization:review",
	"work-summary": "pages:work-summary",
	calculator: "pages:calculator",
	"redaction-toggle": "settings:pii-redaction",
};

/**
 * Whether the current user may see each header item. The nav and the header
 * customizer both read this, so they always agree on what is available.
 */
export function useHeaderItemAvailability(): Record<HeaderItemId, boolean> {
	const { data: session } = useSession();
	const can = useCheckPermission();

	const canSeeEvalReportDashboard =
		(session?.user.isEvaluator ?? false) || can("evaluator-dashboard:admin");
	const canSeeClaimReports =
		session?.user.maxClaimedReports !== 0 || can("reports:approve");
	const canSeeReports =
		(session?.user.maxClaimedReports !== 0 ||
			can("reports:approve") ||
			can("reports:billing")) &&
		can("reports:beta");
	const canSeeQuestionnaireLogins =
		can("settings:qsuite:services:view") || can("settings:qsuite:services");

	const availability = {} as Record<HeaderItemId, boolean>;
	for (const def of HEADER_ITEM_DEFS) {
		if (def.id === "report-dashboard") {
			availability[def.id] = canSeeEvalReportDashboard;
		} else if (def.id === "claim-reports") {
			availability[def.id] = canSeeClaimReports;
		} else if (def.id === "reports") {
			availability[def.id] = canSeeReports;
		} else if (def.id === "questionnaire-logins") {
			availability[def.id] = canSeeQuestionnaireLogins;
		} else {
			const permission = ITEM_PERMISSIONS[def.id];
			availability[def.id] = permission ? can(permission) : true;
		}
	}
	return availability;
}

/** Display labels that depend on data, overriding the static label in the defs. */
export function useHeaderItemLabels(): Partial<Record<HeaderItemId, string>> {
	const { data: session } = useSession();
	const can = useCheckPermission();
	const canSeeEvalReportDashboard =
		(session?.user.isEvaluator ?? false) || can("evaluator-dashboard:admin");
	const { data: config } = api.evaluatorDashboard.getConfig.useQuery(
		undefined,
		{ enabled: canSeeEvalReportDashboard },
	);

	return {
		"report-dashboard": config?.evaluatorFirstName
			? `${config.evaluatorFirstName}'s Reports`
			: undefined,
	};
}

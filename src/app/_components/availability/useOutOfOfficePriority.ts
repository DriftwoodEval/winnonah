"use client";

import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { IS_DEV } from "~/lib/utils";
import { api } from "~/trpc/react";

export const DEV_OOO_PARAM = "devOoo";

/**
 * Wraps evaluators.getOutOfOfficePriority so a dev-only `?devOoo=true|false`
 * search param can override the real value, letting staff preview the
 * availability page as either an in-office or out-of-office evaluator.
 */
export function useOutOfOfficePriority(enabled = true) {
	const { data: session } = useSession();
	const searchParams = useSearchParams();

	const query = api.evaluators.getOutOfOfficePriority.useQuery(undefined, {
		enabled: (session?.user.isEvaluator ?? false) && enabled,
	});

	const devOverride =
		IS_DEV && !session?.user.isImpersonating
			? searchParams.get(DEV_OOO_PARAM)
			: null;
	const data =
		devOverride === "true"
			? true
			: devOverride === "false"
				? false
				: query.data;

	return { ...query, data };
}

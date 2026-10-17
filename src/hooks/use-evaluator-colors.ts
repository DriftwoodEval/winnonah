import { useMemo } from "react";
import { api } from "~/trpc/react";

/**
 * Colors evaluators picked, as NPI to index into USER_COLORS. Automatic
 * assignment treats every value as taken.
 */
export function useEvaluatorColors(): Map<number, number> {
	const { data } = api.evaluators.getColors.useQuery();
	return useMemo(
		() =>
			new Map(
				(data ?? []).flatMap((ev) =>
					ev.color === null ? [] : [[ev.npi, ev.color] as const],
				),
			),
		[data],
	);
}

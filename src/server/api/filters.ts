import { eq } from "drizzle-orm";
import type { Context } from "~/server/api/trpc";
import { insuranceAliases, insurances } from "~/server/db/schema";

// Sentinel value meaning "the underlying field is null/unset", used across all
// multi-select filters so a user can filter for e.g. "no language on file."
export const NONE_FILTER_VALUE = "__none__";

// Splits a multi-select filter value list into the concrete values to match
// and whether the "None" sentinel was selected too.
export function splitNoneValue(values: string[]) {
	return {
		values: values.filter((v) => v !== NONE_FILTER_VALUE),
		includeNone: values.includes(NONE_FILTER_VALUE),
	};
}

// Resolves the raw insurance values (shortName + all its aliases) that should
// match a given insurance shortName, mirroring the alias-resolution used in `search`.
// `cache` lets callers that resolve the same shortName repeatedly within one
// request (e.g. directoryFacetCounts, which rebuilds filter conditions once
// per facet) share the lookup instead of re-querying it every time. Storing
// the in-flight promise (not just the resolved value) also collapses
// concurrent lookups for the same shortName into a single query.
export async function resolveInsuranceAliasNames(
	db: Context["db"],
	shortName: string,
	cache?: Map<string, Promise<string[]>>,
) {
	const cached = cache?.get(shortName);
	if (cached) return cached;

	const promise = (async () => {
		const aliasRows = await db
			.select({ name: insuranceAliases.name })
			.from(insuranceAliases)
			.innerJoin(insurances, eq(insuranceAliases.insuranceId, insurances.id))
			.where(eq(insurances.shortName, shortName));

		return [shortName, ...aliasRows.map((row) => row.name)];
	})();

	cache?.set(shortName, promise);
	return promise;
}

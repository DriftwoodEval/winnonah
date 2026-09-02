import { and, eq, sql } from "drizzle-orm";
import { getDistanceSQL } from "~/lib/utils";
import type { Context } from "~/server/api/trpc";
import {
	insuranceAliases,
	insurances,
	officeDriveTimes,
	offices,
} from "~/server/db/schema";

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

// Picks a client's closest office, preferring the real by-car distance
// cached in emr_office_drive_time over the straight-line calc, which is
// used only as a fallback for a client not yet backfilled or whose last
// Waze lookup failed. For a single, already-known client (auto-assigning an
// office on the scheduling sheet); a bulk query over many clients should
// build its own correlated-subquery CASE instead (see getOfficeDistanceSQL
// and buildClosestOfficeKeyCaseSQL in ~/lib/utils).
export async function getClosestOfficeKeyByDriveTime(
	db: Context["db"],
	clientId: number,
	clientLat: string,
	clientLon: string,
): Promise<string | undefined> {
	const distanceExpr = sql<number>`CAST(COALESCE(
		${officeDriveTimes.distanceMiles},
		${getDistanceSQL(clientLat, clientLon, offices.latitude, offices.longitude)}
	) AS DOUBLE)`;

	const [closest] = await db
		.select({ key: offices.key })
		.from(offices)
		.leftJoin(
			officeDriveTimes,
			and(
				eq(officeDriveTimes.officeKey, offices.key),
				eq(officeDriveTimes.clientId, clientId),
			),
		)
		.orderBy(distanceExpr)
		.limit(1);

	return closest?.key;
}

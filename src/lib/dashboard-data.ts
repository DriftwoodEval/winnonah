import { and, eq, not, sql } from "drizzle-orm";
import type { Session } from "next-auth";
import { fetchWithCache } from "~/lib/cache";
import {
	getDashboardSections,
	getDuplicatePunchClients,
	sortNeedsReachOut,
} from "~/lib/dashboard";
import {
	CACHE_KEY_MISSING_PUNCHLIST,
	CACHE_KEY_PUNCHLIST,
	getMissingFromPunchlistData,
	getPunchData,
} from "~/lib/google";
import type { Context } from "~/server/api/trpc";
import { clients } from "~/server/db/schema";

/**
 * Fetches punchlist/DB data and computes dashboard sections. Shared by the
 * live dashboard tRPC query and the background section-history poller so
 * both use identical filtering logic.
 */
export async function getFullDashboardData(
	ctx: Pick<Context, "db" | "redis"> & { session: Session },
) {
	const isNotesOnly = eq(sql`LENGTH(${clients.id})`, 5);

	const [punchClients, missingClients, needsReachOut, needsReview] =
		await Promise.all([
			fetchWithCache(
				ctx,
				CACHE_KEY_PUNCHLIST,
				() => getPunchData(ctx.session),
				60,
			),
			fetchWithCache(
				ctx,
				CACHE_KEY_MISSING_PUNCHLIST,
				() => getMissingFromPunchlistData(ctx.session),
				60,
			),
			ctx.db.query.clients.findMany({
				where: and(
					eq(clients.status, true),
					not(isNotesOnly),
					sql`JSON_EXTRACT(${clients.referralData}, '$.needsReachOut') = 'reach_out'`,
				),
				orderBy: (c, { asc }) => asc(c.addedDate),
			}),
			ctx.db.query.clients.findMany({
				where: and(
					eq(clients.status, true),
					not(isNotesOnly),
					sql`JSON_EXTRACT(${clients.referralData}, '$.needsReachOut') = 'review'`,
				),
				orderBy: (c, { asc }) => asc(c.addedDate),
			}),
		]);

	const duplicatePunchClients = getDuplicatePunchClients(punchClients).map(
		({ client, count }) => ({
			hash: client.hash,
			name: client.fullName ?? client["Client Name"] ?? String(client.id),
			count,
		}),
	);

	const sortedNeedsReachOut = sortNeedsReachOut(needsReachOut);

	return {
		punchClients,
		missingClients,
		needsReachOut: sortedNeedsReachOut,
		needsReview,
		sections: getDashboardSections(
			punchClients,
			missingClients,
			sortedNeedsReachOut,
			needsReview,
		),
		punchlistCount: punchClients?.length ?? 0,
		duplicatePunchClients,
	};
}

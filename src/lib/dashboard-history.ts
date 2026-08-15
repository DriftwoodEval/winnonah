import fs from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import type { Session } from "next-auth";
import { getClientMatchedSections } from "~/lib/dashboard";
import { getFullDashboardData } from "~/lib/dashboard-data";
import { logger } from "~/lib/logger";
import { redis } from "~/lib/redis";
import { db } from "~/server/db";
import { clientDashboardSectionHistory } from "~/server/db/schema";

const log = logger.child({ module: "dashboard-history" });

/**
 * Builds a session-shaped credential from the shared Google OAuth token used
 * by the Python sidecar and one-off scripts (see scripts/migrate-punchlist-records.ts),
 * so this background job can call the same session-scoped data fetchers
 * (getPunchData, getMissingFromPunchlistData) used by the live dashboard.
 *
 * The refresh token in token.json was issued to Python's own OAuth client
 * (auth_cache/credentials.json), not this app's AUTH_GOOGLE_ID/SECRET. If we
 * hand a stale access token to getSheetsClient, its auto-refresh uses the
 * wrong client and Google rejects it with "unauthorized_client". So we
 * proactively refresh here, with the matching client, before building the
 * session.
 */
export async function getServiceSession(): Promise<Session> {
	const tokenPath = path.resolve("python/auth_cache/token.json");
	const credentialsPath = path.resolve("python/auth_cache/credentials.json");

	const token = JSON.parse(fs.readFileSync(tokenPath, "utf-8")) as {
		refresh_token: string;
	};
	const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8")) as {
		installed: { client_id: string; client_secret: string };
	};

	const oauth2Client = new OAuth2Client({
		clientId: credentials.installed.client_id,
		clientSecret: credentials.installed.client_secret,
	});
	oauth2Client.setCredentials({ refresh_token: token.refresh_token });

	const { credentials: refreshed } = await oauth2Client.refreshAccessToken();
	if (!refreshed.access_token) {
		throw new Error("Failed to refresh Google access token for dashboard sync");
	}

	return {
		user: {
			accessToken: refreshed.access_token,
			refreshToken: token.refresh_token,
		},
	} as Session;
}

function sectionsKey(sections: string[]): string {
	return [...sections].sort().join("|");
}

/**
 * Computes each client's current matched dashboard sections using the same
 * logic as the live dashboard (src/lib/dashboard.ts), and records a new
 * history row whenever a client's matched sections change.
 */
export async function syncDashboardSectionHistory() {
	const session = await getServiceSession();
	const { punchClients, missingClients, needsReachOut, needsReview } =
		await getFullDashboardData({ db, redis, session });

	// Punch rows with no matching DB client (getPunchData returns sheet-only
	// data for those) have no `id`, so filter those out before inserting.
	const hasId = (c: { id?: number | null }): c is { id: number } =>
		typeof c.id === "number";

	const clientIds = new Set<number>([
		...(punchClients?.filter(hasId).map((c) => c.id) ?? []),
		...(missingClients?.filter(hasId).map((c) => c.id) ?? []),
		...(needsReachOut?.filter(hasId).map((c) => c.id) ?? []),
		...(needsReview?.filter(hasId).map((c) => c.id) ?? []),
	]);

	let updatedCount = 0;
	for (const clientId of clientIds) {
		const matchedSections = getClientMatchedSections(
			{ id: clientId },
			punchClients,
			missingClients,
			needsReachOut,
			needsReview,
		);

		const [lastRow] = await db
			.select({ sections: clientDashboardSectionHistory.sections })
			.from(clientDashboardSectionHistory)
			.where(eq(clientDashboardSectionHistory.clientId, clientId))
			.orderBy(desc(clientDashboardSectionHistory.createdAt))
			.limit(1);

		if (
			lastRow &&
			sectionsKey(lastRow.sections) === sectionsKey(matchedSections)
		) {
			continue;
		}

		await db.insert(clientDashboardSectionHistory).values({
			clientId,
			sections: matchedSections,
		});
		updatedCount++;
	}

	log.info(
		`Synced dashboard section history for ${clientIds.size} clients, ${updatedCount} changed.`,
	);
}

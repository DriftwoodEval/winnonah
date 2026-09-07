import fs from "node:fs";
import path from "node:path";
import { desc, eq, lt } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import type { Session } from "next-auth";
import {
	getClientFailureSections,
	getClientIssueListSections,
	getClientMatchedSections,
	SECTION_ISSUE_DUPLICATE_QUESTIONNAIRES,
	SECTION_ISSUE_MISSING_APPOINTMENTS,
	SECTION_ISSUE_PARTIAL_BATTERY,
	SECTION_ISSUE_UNREVIEWED_RECORDS,
} from "~/lib/dashboard";
import { getFullDashboardData } from "~/lib/dashboard-data";
import {
	getDuplicateQuestionnaireLinksData,
	getMissingAppointmentsList,
	getPartialBatteriesList,
	getUnreviewedRecordsList,
} from "~/lib/issue-lists";
import { logger } from "~/lib/logger";
import { redis } from "~/lib/redis";
import { db } from "~/server/db";
import {
	clientDashboardSectionHistory,
	clients,
	failures,
} from "~/server/db/schema";

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
async function getServiceSession(): Promise<Session> {
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
	const [
		{ punchClients, missingClients, needsReachOut, needsReview },
		allClients,
		activeFailures,
		unreviewedRecords,
		missingAppointments,
		duplicateQuestionnaireLinks,
		partialBatteries,
	] = await Promise.all([
		getFullDashboardData({ db, redis, session }),
		db
			.select({
				id: clients.id,
				status: clients.status,
				pause: clients.pause,
				autismStop: clients.autismStop,
				evaluationInProcess: clients.evaluationInProcess,
				schoolDistrict: clients.schoolDistrict,
				referralSource: clients.referralSource,
				dob: clients.dob,
				flag: clients.flag,
				primaryInsurance: clients.primaryInsurance,
				secondaryInsurance: clients.secondaryInsurance,
				addedDate: clients.addedDate,
				driveId: clients.driveId,
			})
			.from(clients),
		db.select().from(failures).where(lt(failures.reminded, 100)),
		getUnreviewedRecordsList(db),
		getMissingAppointmentsList(db),
		getDuplicateQuestionnaireLinksData(db),
		getPartialBatteriesList({ db, redis, session }),
	]);

	const unreviewedRecordsIds = new Set(unreviewedRecords.map((c) => c.id));
	const missingAppointmentsIds = new Set(missingAppointments.map((c) => c.id));
	const duplicateQuestionnaireIds = new Set([
		...duplicateQuestionnaireLinks.duplicatePerClient
			.map((row) => row.client?.id)
			.filter((id): id is number => typeof id === "number"),
		...duplicateQuestionnaireLinks.sharedAcrossClients.flatMap((row) =>
			row.clients.map((c) => c.client.id),
		),
	]);
	const partialBatteryIds = new Set(partialBatteries.map((c) => c.id));

	// Punch rows with no matching DB client (getPunchData returns sheet-only
	// data for those) have no `id`, so filter those out before inserting.
	const hasId = (c: { id?: number | null }): c is { id: number } =>
		typeof c.id === "number";

	const failuresByClientId = new Map<number, typeof activeFailures>();
	for (const failure of activeFailures) {
		const clientFailures = failuresByClientId.get(failure.clientId) ?? [];
		clientFailures.push(failure);
		failuresByClientId.set(failure.clientId, clientFailures);
	}

	const clientsById = new Map(allClients.map((c) => [c.id, c]));

	const clientIds = new Set<number>([
		...(punchClients?.filter(hasId).map((c) => c.id) ?? []),
		...(missingClients?.filter(hasId).map((c) => c.id) ?? []),
		...(needsReachOut?.filter(hasId).map((c) => c.id) ?? []),
		...(needsReview?.filter(hasId).map((c) => c.id) ?? []),
		...allClients
			.filter(
				(c) =>
					getClientIssueListSections({
						...c,
						failures: failuresByClientId.get(c.id),
					}).length > 0,
			)
			.map((c) => c.id),
		...failuresByClientId.keys(),
		...unreviewedRecordsIds,
		...missingAppointmentsIds,
		...duplicateQuestionnaireIds,
		...partialBatteryIds,
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
		const clientFailures = failuresByClientId.get(clientId);
		const issueListSections = getClientIssueListSections({
			...(clientsById.get(clientId) ?? { id: clientId }),
			failures: clientFailures,
		});
		const failureSections = getClientFailureSections(clientFailures);
		const batchIssueSections = [
			unreviewedRecordsIds.has(clientId) && SECTION_ISSUE_UNREVIEWED_RECORDS,
			missingAppointmentsIds.has(clientId) &&
				SECTION_ISSUE_MISSING_APPOINTMENTS,
			duplicateQuestionnaireIds.has(clientId) &&
				SECTION_ISSUE_DUPLICATE_QUESTIONNAIRES,
			partialBatteryIds.has(clientId) && SECTION_ISSUE_PARTIAL_BATTERY,
		].filter((s): s is string => typeof s === "string");
		const sections = [
			...matchedSections,
			...issueListSections,
			...batchIssueSections,
			...failureSections,
		];

		const [lastRow] = await db
			.select({ sections: clientDashboardSectionHistory.sections })
			.from(clientDashboardSectionHistory)
			.where(eq(clientDashboardSectionHistory.clientId, clientId))
			.orderBy(desc(clientDashboardSectionHistory.createdAt))
			.limit(1);

		if (lastRow && sectionsKey(lastRow.sections) === sectionsKey(sections)) {
			continue;
		}

		await db.insert(clientDashboardSectionHistory).values({
			clientId,
			sections,
		});
		updatedCount++;
	}

	log.info(
		`Synced dashboard section history for ${clientIds.size} clients, ${updatedCount} changed.`,
	);
}

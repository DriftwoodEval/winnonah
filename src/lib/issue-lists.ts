import { format, subBusinessDays } from "date-fns";
import {
	and,
	asc,
	count,
	countDistinct,
	eq,
	getTableColumns,
	gt,
	inArray,
	isNotNull,
	isNull,
	lt,
	not,
	sql,
} from "drizzle-orm";
import type { Session } from "next-auth";
import { calculateAdditionalAppointments } from "~/lib/billing";
import { fetchWithCache } from "~/lib/cache";
import { CACHE_KEY_PUNCHLIST, getPunchData } from "~/lib/google";
import type { ClientWithIssueInfo } from "~/lib/models";
import type { Context } from "~/server/api/trpc";
import {
	appointments,
	clients,
	externalRecordRequests,
	externalRecords,
	failures,
	questionnaireRules,
	questionnaires,
} from "~/server/db/schema";
import { resolveApplicableRules } from "~/server/questionnaire-rules";

const isNotesOnly = eq(sql`LENGTH(${clients.id})`, 5);

/**
 * Clients whose records are needed but haven't been reviewed/received in the
 * three weekdays since the most recent request. Mirrors the /issues page's
 * "Unreviewed/Unreceived Records" list (client.ts's getUnreviewedRecords).
 */
export async function getUnreviewedRecordsList(db: Context["db"]) {
	const threeWeekdaysAgo = format(subBusinessDays(new Date(), 3), "yyyy-MM-dd");

	const latestRequest = db
		.select({
			clientId: externalRecordRequests.clientId,
			latestDate: sql<string>`MAX(${externalRecordRequests.requestedDate})`.as(
				"latest_date",
			),
		})
		.from(externalRecordRequests)
		.where(isNotNull(externalRecordRequests.requestedDate))
		.groupBy(externalRecordRequests.clientId)
		.as("latest_request");

	return db
		.select({
			...getTableColumns(clients),
			additionalInfo: sql<string>`CONCAT(
				'(Requested: ',
				DATE_FORMAT(${latestRequest.latestDate}, '%m/%d/%y'),
				')'
			)`,
		})
		.from(clients)
		.innerJoin(externalRecords, eq(clients.id, externalRecords.clientId))
		.innerJoin(latestRequest, eq(clients.id, latestRequest.clientId))
		.where(
			and(
				eq(clients.recordsNeeded, "Needed"),
				lt(latestRequest.latestDate, threeWeekdaysAgo),
				isNull(externalRecords.content),
			),
		)
		.orderBy(asc(latestRequest.latestDate));
}

/**
 * Clients whose insurance allows additional appointments (96130/96136/96137)
 * beyond the base evaluation, but don't have enough of them scheduled yet.
 * Mirrors the /issues page's "Appointments to be Created" list (client.ts's
 * getMissingAppointments).
 */
export async function getMissingAppointmentsList(
	db: Context["db"],
): Promise<ClientWithIssueInfo[]> {
	const activeClients = await db.query.clients.findMany({
		where: and(
			eq(clients.status, true),
			isNotNull(clients.primaryInsurance),
			not(isNotesOnly),
		),
	});

	if (activeClients.length === 0) return [];

	const allInsurances = await db.query.insurances.findMany({
		with: { aliases: true },
	});

	type InsuranceWithAliases = (typeof allInsurances)[0];
	const insuranceByName = new Map<string, InsuranceWithAliases>();
	for (const ins of allInsurances) {
		insuranceByName.set(ins.shortName, ins);
		for (const alias of ins.aliases) {
			insuranceByName.set(alias.name, ins);
		}
	}

	const relevantClients = activeClients.filter((c) => {
		if (!c.primaryInsurance) return false;
		const ins = insuranceByName.get(c.primaryInsurance);
		return (
			((ins?.additionalAppts as { maxUnitsPerDay?: number } | undefined)
				?.maxUnitsPerDay ?? 0) > 0
		);
	});

	if (relevantClients.length === 0) return [];

	const clientIds = relevantClients.map((c) => c.id);

	const apptCountRows = await db
		.select({
			clientId: appointments.clientId,
			activeCount: count(),
		})
		.from(appointments)
		.where(
			and(
				inArray(appointments.clientId, clientIds),
				eq(appointments.cancelled, false),
				eq(appointments.placeholder, false),
			),
		)
		.groupBy(appointments.clientId);

	const apptCountMap = new Map(
		apptCountRows.map((r) => [r.clientId, r.activeCount]),
	);

	const apptCptRows = await db
		.select({
			clientId: appointments.clientId,
			cpt: appointments.cpt,
			cptCount: count(),
		})
		.from(appointments)
		.where(
			and(
				inArray(appointments.clientId, clientIds),
				eq(appointments.cancelled, false),
				eq(appointments.placeholder, false),
			),
		)
		.groupBy(appointments.clientId, appointments.cpt);

	const count96136ByClient = new Map<number, number>();
	const has9613637ByClient = new Set<number>();
	const count96130ByClient = new Map<number, number>();
	for (const row of apptCptRows) {
		if (row.cpt === "96136") {
			count96136ByClient.set(row.clientId, row.cptCount);
			has9613637ByClient.add(row.clientId);
		} else if (row.cpt === "96137") {
			has9613637ByClient.add(row.clientId);
		} else if (row.cpt === "96130") {
			count96130ByClient.set(row.clientId, row.cptCount);
		}
	}

	const result: ClientWithIssueInfo[] = [];
	for (const client of relevantClients) {
		if (!client.primaryInsurance) continue;
		const ins = insuranceByName.get(client.primaryInsurance);
		const apptConfig = ins?.additionalAppts as
			| {
					maxUnitsPerDay?: number;
					max96130?: number;
					max96131?: number;
					max96136?: number;
					max96137?: number;
					maxAppt4Units?: number;
			  }
			| undefined;
		const maxUnitsPerDay = apptConfig?.maxUnitsPerDay;
		if (!maxUnitsPerDay) continue;

		const totalMinutes = client.assessmentData?.minutes ?? 0;
		if (totalMinutes === 0) continue;

		const expectedCount = calculateAdditionalAppointments(
			totalMinutes,
			maxUnitsPerDay,
			{
				max96130: apptConfig?.max96130,
				max96131: apptConfig?.max96131,
				max96136: apptConfig?.max96136,
				max96137: apptConfig?.max96137,
				maxAppt4Units: apptConfig?.maxAppt4Units,
			},
		).length;

		if (expectedCount === 0) continue;

		const actualCount = apptCountMap.get(client.id) ?? 0;
		if (actualCount >= expectedCount) continue;

		const has96130 = (count96130ByClient.get(client.id) ?? 0) > 0;
		const hasExactlyOne96136 = count96136ByClient.get(client.id) === 1;
		const has9613637WithoutReview =
			has9613637ByClient.has(client.id) && !has96130;
		if (!hasExactlyOne96136 && !has9613637WithoutReview) continue;

		result.push({
			...client,
			additionalInfo: `(${actualCount} of ${expectedCount} appts)`,
		});
	}

	return result;
}

/**
 * Questionnaire links reused more than once for the same client, or shared
 * across different clients. Mirrors the /issues page's "Duplicate
 * Questionnaires" list (questionnaires.ts's getDuplicateLinks).
 */
export async function getDuplicateQuestionnaireLinksData(db: Context["db"]) {
	const duplicatePerClient = await db
		.select({
			link: questionnaires.link,
			clientId: questionnaires.clientId,
			count: count().as("count"),
		})
		.from(questionnaires)
		.where(
			and(
				isNotNull(questionnaires.link),
				not(eq(questionnaires.status, "ARCHIVED")),
			),
		)
		.groupBy(questionnaires.link, questionnaires.clientId)
		.having(gt(count(), 1));

	const clientIdsForDuplicates = duplicatePerClient.map((row) => row.clientId);
	const clientsForDuplicates =
		clientIdsForDuplicates.length > 0
			? await db
					.select()
					.from(clients)
					.where(inArray(clients.id, clientIdsForDuplicates))
			: [];

	const sharedAcrossClients = await db
		.select({
			link: questionnaires.link,
		})
		.from(questionnaires)
		.where(
			and(
				isNotNull(questionnaires.link),
				not(eq(questionnaires.status, "ARCHIVED")),
			),
		)
		.groupBy(questionnaires.link)
		.having(gt(countDistinct(questionnaires.clientId), 1));

	const sharedLinksWithClients = await Promise.all(
		sharedAcrossClients.map(async ({ link }) => {
			if (link === null) {
				return {
					link: null,
					clients: [],
				};
			}

			const clientsWithLink = await db
				.select({
					client: clients,
					count: count().as("count"),
				})
				.from(questionnaires)
				.innerJoin(clients, eq(questionnaires.clientId, clients.id))
				.where(
					and(
						eq(questionnaires.link, link),
						not(eq(questionnaires.status, "ARCHIVED")),
					),
				)
				.groupBy(clients.id);

			return {
				link,
				clients: clientsWithLink,
			};
		}),
	);

	return {
		duplicatePerClient: duplicatePerClient.map((row) => ({
			link: row.link,
			client: clientsForDuplicates.find((c) => c.id === row.clientId),
			count: row.count,
		})),
		sharedAcrossClients: sharedLinksWithClients,
	};
}

/**
 * Active clients who need a DA and/or Eval battery, have sent some but not
 * all of the required questionnaire types for it. Mirrors the /issues page's
 * "Partial Questionnaire Battery" list (questionnaires.ts's
 * getPartialBatteries). Loops per client that needs DA/Eval questionnaires,
 * resolving their applicable rules the same way the live page does.
 */
export async function getPartialBatteriesList(
	ctx: Pick<Context, "db" | "redis"> & { session: Session },
) {
	if (!ctx.session.user.accessToken || !ctx.session.user.refreshToken) {
		throw new Error("No access token or refresh token");
	}

	const activeClients = await ctx.db.query.clients.findMany({
		where: and(
			eq(clients.status, true),
			eq(clients.pause, false),
			eq(clients.autismStop, false),
			not(isNotesOnly),
		),
	});

	const punchData = await fetchWithCache(
		ctx,
		CACHE_KEY_PUNCHLIST,
		() => getPunchData(ctx.session),
		60,
	);

	const punchByClientId = new Map(
		punchData.map((row) => [parseInt(row["Client ID"] ?? "", 10), row]),
	);

	const allRules = await ctx.db.query.questionnaireRules.findMany({
		orderBy: [
			asc(questionnaireRules.daeval),
			asc(questionnaireRules.diagnosis),
			asc(questionnaireRules.minAge),
		],
	});

	const results: (typeof clients.$inferSelect & {
		daeval: "DA" | "EVAL";
		missingTypes: string[];
		sentTypes: string[];
		hasDocsNotSigned: boolean;
		hasPortalNotOpened: boolean;
	})[] = [];

	for (const client of activeClients) {
		const punchInfo = punchByClientId.get(client.id);
		const daNeeded = punchInfo?.["DA Qs Needed"] === "TRUE";
		const evalNeeded = punchInfo?.["EVAL Qs Needed"] === "TRUE";

		if (!daNeeded && !evalNeeded) continue;

		const clientQs = await ctx.db.query.questionnaires.findMany({
			where: eq(questionnaires.clientId, client.id),
		});

		const { rules: applicableRules } = await resolveApplicableRules(
			ctx.db,
			client.id,
			client,
			allRules,
			clientQs,
		);

		const daQTypes = new Set<string>();
		const evalQTypes = new Set<string>();
		for (const rule of applicableRules) {
			const qs = rule.questionnaires ?? [];
			if (rule.daeval === "DA") {
				for (const q of qs) daQTypes.add(q);
			}
			if (rule.daeval === "EVAL") {
				for (const q of qs) evalQTypes.add(q);
			}
			// DAEVAL rules only apply to clients getting a combined DA+EVAL
			// battery; don't pull them into a single DA-only or EVAL-only need.
			if (rule.daeval === "DAEVAL" && daNeeded && evalNeeded) {
				for (const q of qs) {
					daQTypes.add(q);
					evalQTypes.add(q);
				}
			}
		}

		if (daQTypes.size === 0 && evalQTypes.size === 0) continue;

		const activeSentTypes = new Set(
			clientQs
				.filter((q) => q.status !== "ARCHIVED")
				.map((q) => q.questionnaireType),
		);

		const batteriesToCheck = [
			["DA", daQTypes, daNeeded],
			["EVAL", evalQTypes, evalNeeded],
		] as const;

		for (const [daeval, requiredTypes, needed] of batteriesToCheck) {
			if (!needed || requiredTypes.size === 0) continue;

			const sentTypes = [...requiredTypes].filter((t) =>
				activeSentTypes.has(t),
			);
			const missingTypes = [...requiredTypes].filter(
				(t) => !activeSentTypes.has(t),
			);

			if (sentTypes.length > 0 && missingTypes.length > 0) {
				const clientFailures = await ctx.db.query.failures.findMany({
					where: and(
						eq(failures.clientId, client.id),
						lt(failures.reminded, 100),
					),
				});

				const hasDocsNotSigned = clientFailures.some(
					(f) => f.reason === "docs not signed",
				);
				const hasPortalNotOpened = clientFailures.some(
					(f) => f.reason === "portal not opened",
				);

				results.push({
					...client,
					daeval,
					missingTypes,
					sentTypes,
					hasDocsNotSigned,
					hasPortalNotOpened,
				});
			}
		}
	}

	return results;
}

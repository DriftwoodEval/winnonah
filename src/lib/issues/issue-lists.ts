import { format, subBusinessDays } from "date-fns";
import {
	and,
	asc,
	count,
	eq,
	getTableColumns,
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
import { CACHE_KEY_PUNCHLIST, getPunchData } from "~/lib/integrations/google";
import type { ClientWithIssueInfo } from "~/lib/models";
import {
	getInsuranceMismatchSignature,
	getInsuranceShortName,
	getInsuranceShortNamesList,
	isPolicyActive,
} from "~/lib/utils";
import type { Context } from "~/server/api/trpc";
import {
	appointments,
	clientInsurancePolicies,
	clients,
	ddsFaxRequests,
	duplicateNameIgnore,
	externalRecordRequests,
	externalRecords,
	failures,
	insuranceMismatchIgnore,
	questionnaireRules,
	questionnaires,
	specialAccommodationsNotices,
} from "~/server/db/schema";
import {
	ageAtReference,
	getMostRecentEvalStartTimes,
} from "~/server/services/questionnaire-age";
import { resolveApplicableRules } from "~/server/services/questionnaire-rules";

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
 * Clients whose intake says charter school, records are needed and haven't
 * been requested yet, and nobody has confirmed the charter-school answer.
 * Records automation skips them until confirmed (see
 * isCharterSchoolUnconfirmed in client-blockers.ts).
 */
export async function getUnconfirmedCharterSchoolList(db: Context["db"]) {
	return db
		.select(getTableColumns(clients))
		.from(clients)
		.where(
			and(
				not(isNotesOnly),
				eq(clients.status, true),
				eq(clients.recordsNeeded, "Needed"),
				sql`JSON_UNQUOTE(JSON_EXTRACT(${clients.referralData}, '$.charterSchool')) = 'yes'`,
				sql`COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${clients.referralData}, '$.charterSchoolConfirmed')), 'false') != 'true'`,
				sql`NOT EXISTS (
					SELECT 1 FROM ${externalRecords}
					WHERE ${externalRecords.clientId} = ${clients.id}
					AND ${externalRecords.content} IS NOT NULL
				)`,
				sql`NOT EXISTS (
					SELECT 1 FROM ${externalRecordRequests}
					WHERE ${externalRecordRequests.clientId} = ${clients.id}
					AND ${externalRecordRequests.requestedDate} IS NOT NULL
					AND (${clients.sessionStartedAt} IS NULL
						OR ${externalRecordRequests.createdAt} >= ${clients.sessionStartedAt})
				)`,
			),
		)
		.orderBy(asc(clients.addedDate));
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
					using90000BillingCode?: boolean;
					max96130?: number;
					max96131?: number;
					max96136?: number;
					max96137?: number;
					maxAppt4Units?: number;
			  }
			| undefined;
		if (apptConfig?.using90000BillingCode) continue;

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
 * Non-English Medicaid/BabyNet clients with a newly scheduled appointment whose
 * SCDHHS Special Accommodations notice is waiting for staff to approve or deny.
 * The appointment sync creates the pending rows.
 */
export async function getSpecialAccommodationsList(
	db: Context["db"],
): Promise<ClientWithIssueInfo[]> {
	return db
		.select({
			...getTableColumns(clients),
			additionalInfo: sql<string>`CONCAT('(', ${specialAccommodationsNotices.language}, ')')`,
		})
		.from(specialAccommodationsNotices)
		.innerJoin(clients, eq(clients.id, specialAccommodationsNotices.clientId))
		.where(eq(specialAccommodationsNotices.status, "pending"))
		.orderBy(asc(specialAccommodationsNotices.createdAt));
}

/**
 * Clients named on a Disability Determination Services fax, one row per fax,
 * waiting for staff to approve or deny sending their psychological evaluation.
 * The fax categorization cron creates the pending rows and preselects the PDF.
 */
export async function getDdsRequestsList(
	db: Context["db"],
): Promise<ClientWithIssueInfo[]> {
	return db
		.select({
			...getTableColumns(clients),
			ddsRequestId: ddsFaxRequests.id,
			additionalInfo: sql<string>`COALESCE(${ddsFaxRequests.selectedFileName}, 'No psychological evaluation found')`,
		})
		.from(ddsFaxRequests)
		.innerJoin(clients, eq(clients.id, ddsFaxRequests.clientId))
		.where(eq(ddsFaxRequests.status, "pending"))
		.orderBy(asc(ddsFaxRequests.createdAt));
}

/**
 * Active clients whose Medicaid portal organization doesn't resolve to
 * either of their insurances on file. Mirrors the mismatch check in
 * getInsurancePolicies (client.ts), run fleet-wide instead of per-client:
 * like the banner on the client page, it needs a Medicaid policy id and an
 * active policy to compare against.
 */
export async function getInsuranceMismatchList(
	db: Context["db"],
): Promise<ClientWithIssueInfo[]> {
	const [activeClients, allInsurances, ignores] = await Promise.all([
		db.query.clients.findMany({
			where: and(
				eq(clients.status, true),
				isNotNull(clients.medicaidOrganization),
				isNotNull(clients.medicaidPolicyId),
				not(isNotesOnly),
			),
		}),
		db.query.insurances.findMany({ with: { aliases: true } }),
		db.select().from(insuranceMismatchIgnore),
	]);
	const ignoredSignatures = new Map(
		ignores.map((i) => [i.clientId, i.signature]),
	);

	const result: ClientWithIssueInfo[] = [];
	for (const client of activeClients) {
		if (
			ignoredSignatures.get(client.id) === getInsuranceMismatchSignature(client)
		) {
			continue;
		}

		const organizationInsurance = getInsuranceShortName(
			client.medicaidOrganization,
			allInsurances,
		);
		const organizationMismatch =
			!!organizationInsurance &&
			!getInsuranceShortNamesList(
				client.primaryInsurance,
				client.secondaryInsurance,
				allInsurances,
			).includes(organizationInsurance);

		if (organizationMismatch) {
			result.push({
				...client,
				additionalInfo: `(Organization: ${organizationInsurance})`,
			});
		}
	}

	const policies = await db
		.select({
			clientId: clientInsurancePolicies.clientId,
			policyStartDate: clientInsurancePolicies.policyStartDate,
			policyEndDate: clientInsurancePolicies.policyEndDate,
		})
		.from(clientInsurancePolicies)
		.where(
			inArray(
				clientInsurancePolicies.clientId,
				result.map((client) => client.id),
			),
		);
	const clientsWithActivePolicy = new Set(
		policies
			.filter((p) => isPolicyActive(p.policyStartDate, p.policyEndDate))
			.map((p) => p.clientId),
	);
	return result.filter((client) => clientsWithActivePolicy.has(client.id));
}

/**
 * Active clients the last Medicaid portal lookup could not find, usually
 * because the insurance number on file is wrong.
 */
export async function getMedicaidNotFoundList(
	db: Context["db"],
): Promise<ClientWithIssueInfo[]> {
	return db.query.clients.findMany({
		where: and(
			eq(clients.status, true),
			eq(clients.medicaidNotFound, true),
			not(isNotesOnly),
		),
	});
}

/**
 * Active clients the Medicaid portal reports as an ineligible beneficiary.
 * Mirrors the PersistentStatusAlert banner on the client page (Client.tsx).
 */
export async function getMedicaidIneligibleList(
	db: Context["db"],
): Promise<ClientWithIssueInfo[]> {
	return db.query.clients.findMany({
		where: and(
			eq(clients.status, true),
			sql`upper(${clients.medicaidBeneficiaryStatus}) = 'INELIGIBLE'`,
			not(isNotesOnly),
		),
	});
}

/**
 * Questionnaire links reused more than once for the same client, or shared
 * across different clients. Mirrors the /issues page's "Duplicate
 * Questionnaires" list (questionnaires.ts's getDuplicateLinks).
 */
export async function getDuplicateQuestionnaireLinksData(db: Context["db"]) {
	const linkCounts = await db
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
		.groupBy(questionnaires.link, questionnaires.clientId);

	const countsByLink = new Map<string, typeof linkCounts>();
	for (const row of linkCounts) {
		if (row.link === null) continue;
		const group = countsByLink.get(row.link);
		if (group) group.push(row);
		else countsByLink.set(row.link, [row]);
	}

	const duplicatePerClientRows = linkCounts.filter((row) => row.count > 1);
	const sharedLinkRows = [...countsByLink.values()].filter(
		(rows) => rows.length > 1,
	);

	const neededClientIds = [
		...new Set(
			[...duplicatePerClientRows, ...sharedLinkRows.flat()].map(
				(row) => row.clientId,
			),
		),
	];
	const clientsById = new Map(
		(neededClientIds.length > 0
			? await db
					.select()
					.from(clients)
					.where(inArray(clients.id, neededClientIds))
			: []
		).map((client) => [client.id, client]),
	);

	return {
		duplicatePerClient: duplicatePerClientRows.map((row) => ({
			link: row.link,
			client: clientsById.get(row.clientId),
			count: row.count,
		})),
		sharedAcrossClients: sharedLinkRows.map((rows) => ({
			link: rows[0]?.link ?? null,
			clients: rows.flatMap((row) => {
				const client = clientsById.get(row.clientId);
				return client ? [{ client, count: row.count }] : [];
			}),
		})),
	};
}

function groupByClientId<T extends { clientId: number }>(rows: T[]) {
	const grouped = new Map<number, T[]>();
	for (const row of rows) {
		const group = grouped.get(row.clientId);
		if (group) group.push(row);
		else grouped.set(row.clientId, [row]);
	}
	return grouped;
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

	const needyClients = activeClients.filter((client) => {
		const punchInfo = punchByClientId.get(client.id);
		return (
			punchInfo?.["DA Qs Needed"] === "TRUE" ||
			punchInfo?.["EVAL Qs Needed"] === "TRUE"
		);
	});
	const needyIds = needyClients.map((client) => client.id);
	if (needyIds.length === 0) return results;

	const [allClientQs, allFailures, evalStartByClientId] = await Promise.all([
		ctx.db.query.questionnaires.findMany({
			where: inArray(questionnaires.clientId, needyIds),
		}),
		ctx.db.query.failures.findMany({
			where: and(
				inArray(failures.clientId, needyIds),
				lt(failures.reminded, 100),
			),
		}),
		getMostRecentEvalStartTimes(ctx.db, needyIds),
	]);
	const qsByClientId = groupByClientId(allClientQs);
	const failuresByClientId = groupByClientId(allFailures);

	for (const client of needyClients) {
		const punchInfo = punchByClientId.get(client.id);
		const daNeeded = punchInfo?.["DA Qs Needed"] === "TRUE";
		const evalNeeded = punchInfo?.["EVAL Qs Needed"] === "TRUE";

		const clientQs = qsByClientId.get(client.id) ?? [];

		const { rules: applicableRules } = await resolveApplicableRules(
			ctx.db,
			client.id,
			client,
			allRules,
			clientQs,
			ageAtReference(client.dob, evalStartByClientId.get(client.id)),
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
				const clientFailures = failuresByClientId.get(client.id) ?? [];

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

/**
 * Clients with at least one questionnaire in the JUST_ADDED state. Mirrors the
 * /issues page's "Just Added Questionnaires" list (questionnaires.ts's
 * getJustAdded).
 */
export async function getJustAddedQuestionnairesList(db: Context["db"]) {
	const rows = await db
		.selectDistinct({ client: clients })
		.from(questionnaires)
		.innerJoin(clients, eq(questionnaires.clientId, clients.id))
		.where(eq(questionnaires.status, "JUST_ADDED"));

	return rows.map((row) => row.client);
}

/**
 * Pairs of real clients sharing a first and last name, grouped by name and
 * excluding pairs staff have marked as not duplicates. Mirrors the /issues
 * page's "Duplicate Client Names" list.
 */
export async function getDuplicateNamesList(db: Context["db"]) {
	const [allClients, ignoredPairs] = await Promise.all([
		db.select().from(clients).where(sql`LENGTH(${clients.id}) != 5`),
		db.select().from(duplicateNameIgnore),
	]);

	const ignoredSet = new Set(
		ignoredPairs.map((p) => `${p.clientIdA}:${p.clientIdB}`),
	);

	const byName = new Map<string, typeof allClients>();
	for (const c of allClients) {
		const key = `${c.firstName.toLowerCase()} ${c.lastName.toLowerCase()}`;
		const group = byName.get(key) ?? [];
		group.push(c);
		byName.set(key, group);
	}

	const grouped: {
		name: string;
		pairs: {
			clientA: (typeof allClients)[0];
			clientB: (typeof allClients)[0];
		}[];
	}[] = [];

	for (const group of byName.values()) {
		if (group.length < 2) continue;
		const pairs = [];
		for (let i = 0; i < group.length; i++) {
			for (let j = i + 1; j < group.length; j++) {
				const ca = group[i];
				const cb = group[j];
				if (!ca || !cb) continue;
				const idA = Math.min(ca.id, cb.id);
				const idB = Math.max(ca.id, cb.id);
				if (!ignoredSet.has(`${idA}:${idB}`)) {
					pairs.push({ clientA: ca, clientB: cb });
				}
			}
		}
		const first = pairs[0];
		if (first) grouped.push({ name: first.clientA.fullName, pairs });
	}

	return grouped.sort((a, b) => a.name.localeCompare(b.name));
}

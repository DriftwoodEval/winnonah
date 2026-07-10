import {
	and,
	asc,
	count,
	eq,
	getTableColumns,
	inArray,
	ne,
	or,
	sql,
} from "drizzle-orm";
import type { Session } from "next-auth";
import { z } from "zod";
import { fetchWithCache } from "~/lib/cache";
import type { ALLOWED_ASD_ADHD_VALUES } from "~/lib/constants";
import { syncPunchData } from "~/lib/google";
import {
	getClosestOfficeKey,
	getDistanceSQL,
	getInsuranceShortNamesList,
} from "~/lib/utils";
import { resolveInsuranceAliasNames } from "~/server/api/filters";
import {
	type Context,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { clients, evaluators, schedulingClients } from "~/server/db/schema";

const schedulingFilterSchema = z.object({
	color: z.array(z.string()).optional(),
	evaluator: z.array(z.string()).optional(),
	date: z.array(z.string()).optional(),
	time: z.array(z.string()).optional(),
	asdAdhd: z.array(z.string()).optional(),
	insuranceNames: z.array(z.string()).optional(),
	code: z.array(z.string()).optional(),
	location: z.array(z.string()).optional(),
	district: z.array(z.string()).optional(),
	paDate: z.array(z.string()).optional(),
});

type SchedulingFilterInput = z.infer<typeof schedulingFilterSchema>;
type SchedulingFilterField = keyof SchedulingFilterInput;

// District's display value mirrors the client-side formatting in
// getScheduledClientDisplayValues: shortName if the district is known,
// otherwise the fullName with the trailing "School District" stripped.
function districtDisplayName(district: {
	shortName: string | null;
	fullName: string;
}) {
	return (
		district.shortName ||
		district.fullName.replace(/ (County )?School District/, "")
	);
}

async function fetchSchedulingRefData(ctx: Context) {
	const [allOffices, allEvaluators, allDistricts, allInsurances] =
		await Promise.all([
			fetchWithCache(ctx, "offices:all", () => ctx.db.query.offices.findMany()),
			fetchWithCache(ctx, "evaluators:all", async () => {
				const evaluatorsWithOffices = await ctx.db.query.evaluators.findMany({
					where: ne(evaluators.archived, true),
					orderBy: (evaluators, { asc }) => [asc(evaluators.providerName)],
					with: {
						offices: { with: { office: true } },
						blockedSchoolDistricts: { with: { schoolDistrict: true } },
						blockedZipCodes: { with: { zipCode: true } },
						insurances: { with: { insurance: true } },
					},
				});

				return evaluatorsWithOffices.map((evaluator) => ({
					...evaluator,
					offices: evaluator.offices.map((link) => link.office),
					blockedDistricts: evaluator.blockedSchoolDistricts.map(
						(link) => link.schoolDistrict,
					),
					blockedZips: evaluator.blockedZipCodes.map((link) => link.zipCode),
					insurances: evaluator.insurances.map((link) => link.insurance),
				}));
			}),
			fetchWithCache(ctx, "school-districts:all", () =>
				ctx.db.query.schoolDistricts.findMany({
					orderBy: (schoolDistricts, { asc, sql }) => [
						sql`CASE WHEN ${schoolDistricts.shortName} IS NOT NULL THEN 0 ELSE 1 END`,
						asc(schoolDistricts.shortName),
						asc(schoolDistricts.fullName),
					],
				}),
			),
			fetchWithCache(ctx, "insurances:all", () =>
				ctx.db.query.insurances.findMany({
					orderBy: (insurances, { asc }) => [asc(insurances.shortName)],
					with: { aliases: true },
				}),
			),
		]);

	return { allOffices, allEvaluators, allDistricts, allInsurances };
}

function computeClosestOfficeKeyCase(
	allOffices: Awaited<ReturnType<typeof fetchSchedulingRefData>>["allOffices"],
) {
	const distanceExprs = allOffices.map((o) => ({
		key: o.key,
		dist: getDistanceSQL(
			clients.latitude,
			clients.longitude,
			o.latitude,
			o.longitude,
		),
	}));

	if (distanceExprs.length === 0) return sql`NULL`;

	let closestOfficeKeyCase = sql`CASE `;
	for (let i = 0; i < distanceExprs.length; i++) {
		const current = distanceExprs[i];
		if (!current) continue;
		const others = distanceExprs.filter((_, idx) => idx !== i);

		if (others.length === 0) {
			closestOfficeKeyCase = sql`${current.key}`;
			break;
		}

		const isClosestConditions = others.map(
			(other) => sql`${current.dist} <= ${other.dist}`,
		);
		closestOfficeKeyCase = sql.join([
			closestOfficeKeyCase,
			sql`WHEN `,
			sql.join(isClosestConditions, sql` AND `),
			sql` THEN ${current.key} `,
		]);
	}
	return sql.join([closestOfficeKeyCase, sql`END`]);
}

// Builds the WHERE conditions for the derived, per-column filters shown on the
// scheduling sheet. `exclude` omits one field's own condition, used by
// facetCounts so a column's option counts reflect every *other* active filter.
async function buildSchedulingConditions(
	db: Context["db"],
	input: SchedulingFilterInput,
	refData: Awaited<ReturnType<typeof fetchSchedulingRefData>>,
	closestOfficeKeyCase: ReturnType<typeof computeClosestOfficeKeyCase>,
	exclude?: SchedulingFilterField,
) {
	const conditions = [];

	if (exclude !== "color" && input.color?.length) {
		conditions.push(inArray(schedulingClients.color, input.color));
	}

	if (exclude !== "date" && input.date?.length) {
		conditions.push(inArray(schedulingClients.date, input.date));
	}

	if (exclude !== "time" && input.time?.length) {
		conditions.push(inArray(schedulingClients.time, input.time));
	}

	if (exclude !== "code" && input.code?.length) {
		conditions.push(inArray(schedulingClients.code, input.code));
	}

	if (exclude !== "asdAdhd" && input.asdAdhd?.length) {
		conditions.push(
			inArray(
				clients.asdAdhd,
				input.asdAdhd as (typeof ALLOWED_ASD_ADHD_VALUES)[number][],
			),
		);
	}

	if (exclude !== "paDate" && input.paDate?.length) {
		conditions.push(
			or(
				...input.paDate.map(
					(v) => sql`DATE_FORMAT(${clients.precertExpires}, '%Y-%m-%d') = ${v}`,
				),
			) ?? sql`FALSE`,
		);
	}

	if (exclude !== "evaluator" && input.evaluator?.length) {
		const wantedFirstNames = input.evaluator;
		const matchingNpis = refData.allEvaluators
			.filter((e) =>
				wantedFirstNames.includes(e.providerName.split(" ")[0] ?? ""),
			)
			.map((e) => e.npi);
		conditions.push(
			matchingNpis.length
				? inArray(schedulingClients.evaluator, matchingNpis)
				: sql`FALSE`,
		);
	}

	if (exclude !== "location" && input.location?.length) {
		const wantsVirtual = input.location.includes("Virtual");
		const matchingKeys = refData.allOffices
			.filter((o) => input.location?.includes(o.prettyName))
			.map((o) => o.key);

		const subConditions = [];
		if (wantsVirtual)
			subConditions.push(eq(schedulingClients.office, "Virtual"));
		if (matchingKeys.length) {
			subConditions.push(
				sql`COALESCE(${schedulingClients.office}, ${closestOfficeKeyCase}) IN (${sql.join(
					matchingKeys.map((k) => sql`${k}`),
					sql`, `,
				)})`,
			);
		}
		conditions.push(or(...subConditions) ?? sql`FALSE`);
	}

	if (exclude !== "district" && input.district?.length) {
		const wantedDisplayNames = input.district;
		const matchingFullNames = refData.allDistricts
			.filter((d) => wantedDisplayNames.includes(districtDisplayName(d)))
			.map((d) => d.fullName);
		const knownFullNames = refData.allDistricts.map((d) => d.fullName);

		const subConditions = [];
		if (matchingFullNames.length) {
			subConditions.push(inArray(clients.schoolDistrict, matchingFullNames));
		}
		// Clients whose schoolDistrict has no matching schoolDistricts row fall
		// back to their own stripped name, mirroring the facet count fallback
		// below and the client-side display logic this filter replaced.
		subConditions.push(
			sql`(${
				knownFullNames.length
					? sql`${clients.schoolDistrict} NOT IN (${sql.join(
							knownFullNames.map((n) => sql`${n}`),
							sql`, `,
						)})`
					: sql`${clients.schoolDistrict} IS NOT NULL`
			}) AND REGEXP_REPLACE(${clients.schoolDistrict}, ' (County )?School District', '', 1, 1) IN (${sql.join(
				wantedDisplayNames.map((n) => sql`${n}`),
				sql`, `,
			)})`,
		);
		conditions.push(or(...subConditions) ?? sql`FALSE`);
	}

	if (exclude !== "insuranceNames" && input.insuranceNames?.length) {
		const matchNames = (
			await Promise.all(
				input.insuranceNames.map((v) => resolveInsuranceAliasNames(db, v)),
			)
		).flat();
		if (matchNames.length) {
			const secondaryConditions = matchNames.map(
				(name) =>
					sql`JSON_SEARCH(${clients.secondaryInsurance}, 'one', ${name}) IS NOT NULL`,
			);
			conditions.push(
				or(
					inArray(clients.primaryInsurance, matchNames),
					...secondaryConditions,
				) ?? sql`FALSE`,
			);
		} else {
			conditions.push(sql`FALSE`);
		}
	}

	return conditions;
}

async function fetchScheduledClients(
	ctx: Context & { session: Session },
	archived: boolean,
	input: SchedulingFilterInput,
) {
	const scheduledClientsRaw = await ctx.db.query.schedulingClients.findMany({
		where: eq(schedulingClients.archived, archived),
		columns: { clientId: true },
	});
	if (scheduledClientsRaw.length > 0) {
		await syncPunchData(ctx);
	}

	const refData = await fetchSchedulingRefData(ctx);
	const closestOfficeKeyCase = computeClosestOfficeKeyCase(refData.allOffices);
	const conditions = await buildSchedulingConditions(
		ctx.db,
		input,
		refData,
		closestOfficeKeyCase,
	);

	const scheduledClients = await ctx.db
		.select({
			...getTableColumns(schedulingClients),
			client: {
				hash: clients.hash,
				fullName: clients.fullName,
				asdAdhd: clients.asdAdhd,
				primaryInsurance: clients.primaryInsurance,
				secondaryInsurance: clients.secondaryInsurance,
				schoolDistrict: clients.schoolDistrict,
				precertExpires: clients.precertExpires,
				dob: clients.dob,
				referralData: clients.referralData,
				closestOfficeKey: closestOfficeKeyCase.mapWith(String),
			},
		})
		.from(schedulingClients)
		.innerJoin(clients, eq(schedulingClients.clientId, clients.id))
		.where(and(eq(schedulingClients.archived, archived), ...conditions))
		.orderBy(asc(schedulingClients.sort), asc(schedulingClients.createdAt));

	return {
		clients: scheduledClients.map((item) => ({
			...item,
			office: item.office ?? item.client.closestOfficeKey,
		})),
		evaluators: refData.allEvaluators,
		offices: refData.allOffices,
		schoolDistricts: refData.allDistricts,
		insurances: refData.allInsurances,
	};
}

async function fetchSchedulingFacetCounts(
	ctx: Context,
	archived: boolean,
	input: SchedulingFilterInput,
) {
	const refData = await fetchSchedulingRefData(ctx);
	const closestOfficeKeyCase = computeClosestOfficeKeyCase(refData.allOffices);

	const baseWhere = async (exclude: SchedulingFilterField) =>
		and(
			eq(schedulingClients.archived, archived),
			...(await buildSchedulingConditions(
				ctx.db,
				input,
				refData,
				closestOfficeKeyCase,
				exclude,
			)),
		);

	const toCountMap = (rows: { value: string | null; count: number }[]) => {
		const counts: Record<string, number> = {};
		for (const row of rows) {
			if (row.value === null || row.value === "") continue;
			counts[row.value] = (counts[row.value] ?? 0) + row.count;
		}
		return counts;
	};

	const [
		colorRows,
		dateRows,
		timeRows,
		codeRows,
		asdAdhdRows,
		paDateRows,
		evaluatorRows,
		locationRows,
		districtRows,
		insuranceRows,
	] = await Promise.all([
		ctx.db
			.select({ value: schedulingClients.color, count: count() })
			.from(schedulingClients)
			.innerJoin(clients, eq(schedulingClients.clientId, clients.id))
			.where(await baseWhere("color"))
			.groupBy(schedulingClients.color),
		ctx.db
			.select({ value: schedulingClients.date, count: count() })
			.from(schedulingClients)
			.innerJoin(clients, eq(schedulingClients.clientId, clients.id))
			.where(await baseWhere("date"))
			.groupBy(schedulingClients.date),
		ctx.db
			.select({ value: schedulingClients.time, count: count() })
			.from(schedulingClients)
			.innerJoin(clients, eq(schedulingClients.clientId, clients.id))
			.where(await baseWhere("time"))
			.groupBy(schedulingClients.time),
		ctx.db
			.select({ value: schedulingClients.code, count: count() })
			.from(schedulingClients)
			.innerJoin(clients, eq(schedulingClients.clientId, clients.id))
			.where(await baseWhere("code"))
			.groupBy(schedulingClients.code),
		ctx.db
			.select({ value: clients.asdAdhd, count: count() })
			.from(schedulingClients)
			.innerJoin(clients, eq(schedulingClients.clientId, clients.id))
			.where(await baseWhere("asdAdhd"))
			.groupBy(clients.asdAdhd),
		ctx.db
			.select({
				value: sql<
					string | null
				>`DATE_FORMAT(${clients.precertExpires}, '%Y-%m-%d')`,
				count: count(),
			})
			.from(schedulingClients)
			.innerJoin(clients, eq(schedulingClients.clientId, clients.id))
			.where(await baseWhere("paDate"))
			.groupBy(sql`DATE_FORMAT(${clients.precertExpires}, '%Y-%m-%d')`),
		ctx.db
			.select({ npi: schedulingClients.evaluator, count: count() })
			.from(schedulingClients)
			.innerJoin(clients, eq(schedulingClients.clientId, clients.id))
			.where(await baseWhere("evaluator"))
			.groupBy(schedulingClients.evaluator),
		ctx.db
			.select({
				officeKey: sql<
					string | null
				>`COALESCE(${schedulingClients.office}, ${closestOfficeKeyCase})`,
				count: count(),
			})
			.from(schedulingClients)
			.innerJoin(clients, eq(schedulingClients.clientId, clients.id))
			.where(await baseWhere("location"))
			.groupBy(
				sql`COALESCE(${schedulingClients.office}, ${closestOfficeKeyCase})`,
			),
		ctx.db
			.select({ value: clients.schoolDistrict, count: count() })
			.from(schedulingClients)
			.innerJoin(clients, eq(schedulingClients.clientId, clients.id))
			.where(await baseWhere("district"))
			.groupBy(clients.schoolDistrict),
		ctx.db
			.select({
				primaryInsurance: clients.primaryInsurance,
				secondaryInsurance: clients.secondaryInsurance,
			})
			.from(schedulingClients)
			.innerJoin(clients, eq(schedulingClients.clientId, clients.id))
			.where(await baseWhere("insuranceNames")),
	]);

	const evaluatorCounts: Record<string, number> = {};
	for (const row of evaluatorRows) {
		if (row.npi === null) continue;
		const evaluator = refData.allEvaluators.find((e) => e.npi === row.npi);
		const firstName = evaluator?.providerName.split(" ")[0];
		if (!firstName) continue;
		evaluatorCounts[firstName] = (evaluatorCounts[firstName] ?? 0) + row.count;
	}

	const locationCounts: Record<string, number> = {};
	for (const row of locationRows) {
		if (!row.officeKey) continue;
		const display =
			row.officeKey === "Virtual"
				? "Virtual"
				: refData.allOffices.find((o) => o.key === row.officeKey)?.prettyName;
		if (!display) continue;
		locationCounts[display] = (locationCounts[display] ?? 0) + row.count;
	}

	const districtCounts: Record<string, number> = {};
	for (const row of districtRows) {
		if (!row.value) continue;
		const district = refData.allDistricts.find((d) => d.fullName === row.value);
		const display = district
			? districtDisplayName(district)
			: row.value.replace(/ (County )?School District/, "");
		districtCounts[display] = (districtCounts[display] ?? 0) + row.count;
	}

	const insuranceCounts: Record<string, number> = {};
	for (const row of insuranceRows) {
		const names = getInsuranceShortNamesList(
			row.primaryInsurance,
			row.secondaryInsurance,
			refData.allInsurances,
		);
		for (const name of names) {
			insuranceCounts[name] = (insuranceCounts[name] ?? 0) + 1;
		}
	}

	return {
		color: toCountMap(colorRows),
		date: toCountMap(dateRows),
		time: toCountMap(timeRows),
		code: toCountMap(codeRows),
		asdAdhd: toCountMap(asdAdhdRows),
		paDate: toCountMap(paDateRows),
		evaluator: evaluatorCounts,
		location: locationCounts,
		district: districtCounts,
		insuranceNames: insuranceCounts,
	};
}

export const schedulingRouter = createTRPCRouter({
	get: protectedProcedure
		.input(schedulingFilterSchema)
		.query(async ({ ctx, input }) => fetchScheduledClients(ctx, false, input)),

	getArchived: protectedProcedure
		.input(schedulingFilterSchema)
		.query(async ({ ctx, input }) => fetchScheduledClients(ctx, true, input)),

	facetCounts: protectedProcedure
		.input(schedulingFilterSchema.extend({ archived: z.boolean() }))
		.query(async ({ ctx, input }) =>
			fetchSchedulingFacetCounts(ctx, input.archived, input),
		),

	add: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				code: z.string().optional(),
				office: z.string().optional(),
				// Added for frontend optimistic updates, not used in the database update
				optimisticClient: z.any().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const maxSortResult = await ctx.db
				.select({ maxSort: sql<number>`MAX(${schedulingClients.sort})` })
				.from(schedulingClients)
				.where(eq(schedulingClients.archived, false));
			const nextSort = (maxSortResult[0]?.maxSort ?? -1) + 1;

			let targetOffice = input.office;

			if (!targetOffice) {
				if (input.code === "96136") {
					const [client, allOffices] = await Promise.all([
						ctx.db.query.clients.findFirst({
							where: eq(clients.id, input.clientId),
							columns: { latitude: true, longitude: true },
						}),
						fetchWithCache(ctx, "offices:all", () =>
							ctx.db.query.offices.findMany(),
						),
					]);
					if (client?.latitude && client?.longitude) {
						targetOffice = getClosestOfficeKey(
							parseFloat(client.latitude),
							parseFloat(client.longitude),
							allOffices,
						);
					}
				} else if (input.code === "90791") {
					targetOffice = "Virtual";
				} else {
					const client = await ctx.db.query.clients.findFirst({
						where: eq(clients.id, input.clientId),
						columns: { referralData: true },
					});
					if (client?.referralData?.locationPreference === "virtual") {
						targetOffice = "Virtual";
					}
				}
			}

			await ctx.db
				.insert(schedulingClients)
				.values({
					clientId: input.clientId,
					code: input.code,
					office: targetOffice,
					archived: false,
					sort: nextSort,
				})
				.onDuplicateKeyUpdate({
					set: {
						archived: false,
						code: input.code,
						office: targetOffice,
						createdAt: new Date(),
						sort: nextSort,
					},
				});
		}),

	move: protectedProcedure
		.input(z.object({ clientId: z.number(), neighborClientId: z.number() }))
		.mutation(async ({ ctx, input }) => {
			const [client, neighbor] = await Promise.all([
				ctx.db.query.schedulingClients.findFirst({
					where: eq(schedulingClients.clientId, input.clientId),
					columns: { sort: true },
				}),
				ctx.db.query.schedulingClients.findFirst({
					where: eq(schedulingClients.clientId, input.neighborClientId),
					columns: { sort: true },
				}),
			]);
			if (!client || !neighbor) return;

			await ctx.db.transaction(async (tx) => {
				await tx
					.update(schedulingClients)
					.set({ sort: neighbor.sort })
					.where(eq(schedulingClients.clientId, input.clientId));
				await tx
					.update(schedulingClients)
					.set({ sort: client.sort })
					.where(eq(schedulingClients.clientId, input.neighborClientId));
			});
		}),

	update: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				evaluatorNpi: z.number().nullable().optional(),
				date: z.string().optional(),
				time: z.string().optional(),
				office: z.string().optional(),
				notes: z.string().optional(),
				code: z.string().optional(),
				color: z.string().nullable().optional(),
				sort: z.number().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const updateData: {
				evaluator?: number | null;
				date?: string;
				time?: string;
				office?: string;
				notes?: string;
				code?: string;
				color?: string | null;
				sort?: number;
			} = {};

			if (input.evaluatorNpi !== undefined) {
				updateData.evaluator = input.evaluatorNpi;
			}
			if (input.date !== undefined) {
				updateData.date = input.date;
			}
			if (input.time !== undefined) {
				updateData.time = input.time;
			}
			if (input.office !== undefined) {
				updateData.office = input.office;
			}
			if (input.notes !== undefined) {
				updateData.notes = input.notes;
			}
			if (input.code !== undefined) {
				updateData.code = input.code;
			}
			if (input.color !== undefined) {
				updateData.color = input.color;
			}
			if (input.sort !== undefined) {
				updateData.sort = input.sort;
			}
			await ctx.db
				.update(schedulingClients)
				.set(updateData)
				.where(eq(schedulingClients.clientId, input.clientId));
		}),

	archive: protectedProcedure
		.input(z.object({ clientId: z.number() }))
		.mutation(async ({ ctx, input }) => {
			await ctx.db
				.update(schedulingClients)
				.set({ archived: true })
				.where(eq(schedulingClients.clientId, input.clientId));
		}),

	unarchive: protectedProcedure
		.input(z.object({ clientId: z.number() }))
		.mutation(async ({ ctx, input }) => {
			const maxSortResult = await ctx.db
				.select({ maxSort: sql<number>`MAX(${schedulingClients.sort})` })
				.from(schedulingClients)
				.where(eq(schedulingClients.archived, false));
			const nextSort = (maxSortResult[0]?.maxSort ?? -1) + 1;

			const existing = await ctx.db.query.schedulingClients.findFirst({
				where: eq(schedulingClients.clientId, input.clientId),
				columns: { code: true },
			});

			let newOffice: string | undefined;
			if (existing?.code === "96136") {
				const [client, allOffices] = await Promise.all([
					ctx.db.query.clients.findFirst({
						where: eq(clients.id, input.clientId),
						columns: { latitude: true, longitude: true },
					}),
					fetchWithCache(ctx, "offices:all", () =>
						ctx.db.query.offices.findMany(),
					),
				]);
				if (client?.latitude && client?.longitude) {
					newOffice = getClosestOfficeKey(
						parseFloat(client.latitude),
						parseFloat(client.longitude),
						allOffices,
					);
				}
			} else if (existing?.code === "90791") {
				newOffice = "Virtual";
			}

			if (newOffice !== undefined) {
				await ctx.db
					.update(schedulingClients)
					.set({
						archived: false,
						createdAt: new Date(),
						sort: nextSort,
						office: newOffice,
					})
					.where(eq(schedulingClients.clientId, input.clientId));
			} else {
				await ctx.db
					.update(schedulingClients)
					.set({ archived: false, createdAt: new Date(), sort: nextSort })
					.where(eq(schedulingClients.clientId, input.clientId));
			}
		}),
});

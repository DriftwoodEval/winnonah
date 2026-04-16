import { asc, eq, getTableColumns, sql } from "drizzle-orm";
import { z } from "zod";
import { fetchWithCache } from "~/lib/cache";
import { syncPunchData } from "~/lib/google";
import { getDistanceSQL } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { db } from "~/server/db";
import { clients, schedulingClients } from "~/server/db/schema";

export const schedulingRouter = createTRPCRouter({
	get: protectedProcedure.query(async ({ ctx }) => {
		const scheduledClientsRaw = await db.query.schedulingClients.findMany({
			where: eq(schedulingClients.archived, false),
		});

		const clientIds = scheduledClientsRaw.map((sc) => sc.clientId);
		if (clientIds.length > 0) {
			await syncPunchData(ctx.session);
		}

		const allOffices = await fetchWithCache(ctx, "offices:all", () =>
			ctx.db.query.offices.findMany(),
		);

		const distanceExprs = allOffices.map((o) => ({
			key: o.key,
			dist: getDistanceSQL(
				clients.latitude,
				clients.longitude,
				o.latitude,
				o.longitude,
			),
		}));

		let closestOfficeKeyCase = sql`NULL`;
		if (distanceExprs.length > 0) {
			closestOfficeKeyCase = sql`CASE `;
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
			closestOfficeKeyCase = sql.join([closestOfficeKeyCase, sql`END`]);
		}

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
			.where(eq(schedulingClients.archived, false))
			.orderBy(asc(schedulingClients.sort), asc(schedulingClients.createdAt));

		const allEvaluators = await fetchWithCache(
			ctx,
			"evaluators:all",
			async () => {
				const evaluatorsWithOffices = await ctx.db.query.evaluators.findMany({
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
			},
		);

		const allDistricts = await fetchWithCache(
			ctx,
			"school-districts:all",
			async () => {
				return ctx.db.query.schoolDistricts.findMany({
					orderBy: (schoolDistricts, { asc, sql }) => [
						sql`CASE WHEN ${schoolDistricts.shortName} IS NOT NULL THEN 0 ELSE 1 END`,
						asc(schoolDistricts.shortName),
						asc(schoolDistricts.fullName),
					],
				});
			},
		);

		const allInsurances = await fetchWithCache(
			ctx,
			"insurances:all",
			async () => {
				return ctx.db.query.insurances.findMany({
					orderBy: (insurances, { asc }) => [asc(insurances.shortName)],
					with: {
						aliases: true,
					},
				});
			},
		);

		return {
			clients: scheduledClients.map((item) => ({
				...item,
				office: item.office ?? item.client.closestOfficeKey,
			})),
			evaluators: allEvaluators,
			offices: allOffices,
			schoolDistricts: allDistricts,
			insurances: allInsurances,
		};
	}),

	getArchived: protectedProcedure.query(async ({ ctx }) => {
		const scheduledClientsRaw = await db.query.schedulingClients.findMany({
			where: eq(schedulingClients.archived, true),
		});

		const clientIds = scheduledClientsRaw.map((sc) => sc.clientId);
		if (clientIds.length > 0) {
			await syncPunchData(ctx.session);
		}

		const allOffices = await fetchWithCache(ctx, "offices:all", () =>
			ctx.db.query.offices.findMany(),
		);

		const distanceExprs = allOffices.map((o) => ({
			key: o.key,
			dist: getDistanceSQL(
				clients.latitude,
				clients.longitude,
				o.latitude,
				o.longitude,
			),
		}));

		let closestOfficeKeyCase = sql`NULL`;
		if (distanceExprs.length > 0) {
			closestOfficeKeyCase = sql`CASE `;
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
			closestOfficeKeyCase = sql.join([closestOfficeKeyCase, sql`END`]);
		}

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
					closestOfficeKey: closestOfficeKeyCase,
				},
			})
			.from(schedulingClients)
			.innerJoin(clients, eq(schedulingClients.clientId, clients.id))
			.where(eq(schedulingClients.archived, true))
			.orderBy(asc(schedulingClients.sort), asc(schedulingClients.createdAt));

		const allEvaluators = await fetchWithCache(
			ctx,
			"evaluators:all",
			async () => {
				const evaluatorsWithOffices = await ctx.db.query.evaluators.findMany({
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
			},
		);

		const allDistricts = await fetchWithCache(
			ctx,
			"school-districts:all",
			async () => {
				return ctx.db.query.schoolDistricts.findMany({
					orderBy: (schoolDistricts, { asc, sql }) => [
						sql`CASE WHEN ${schoolDistricts.shortName} IS NOT NULL THEN 0 ELSE 1 END`,
						asc(schoolDistricts.shortName),
						asc(schoolDistricts.fullName),
					],
				});
			},
		);

		const allInsurances = await fetchWithCache(
			ctx,
			"insurances:all",
			async () => {
				return ctx.db.query.insurances.findMany({
					orderBy: (insurances, { asc }) => [asc(insurances.shortName)],
					with: {
						aliases: true,
					},
				});
			},
		);

		return {
			clients: scheduledClients.map((item) => ({
				...item,
				office: item.office ?? item.client.closestOfficeKey,
			})),
			evaluators: allEvaluators,
			offices: allOffices,
			schoolDistricts: allDistricts,
			insurances: allInsurances,
		};
	}),

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
				const client = await ctx.db.query.clients.findFirst({
					where: eq(clients.id, input.clientId),
					columns: { referralData: true },
				});

				if (client?.referralData?.locationPreference === "virtual") {
					targetOffice = "Virtual";
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
		.input(
			z.object({ clientId: z.number(), direction: z.enum(["up", "down"]) }),
		)
		.mutation(async ({ ctx, input }) => {
			const allClients = await ctx.db
				.select({ clientId: schedulingClients.clientId })
				.from(schedulingClients)
				.where(eq(schedulingClients.archived, false))
				.orderBy(asc(schedulingClients.sort), asc(schedulingClients.createdAt));

			const index = allClients.findIndex((c) => c.clientId === input.clientId);
			if (index === -1) return;

			let newIndex = index;
			if (input.direction === "up" && index > 0) {
				newIndex = index - 1;
			} else if (input.direction === "down" && index < allClients.length - 1) {
				newIndex = index + 1;
			}

			if (newIndex !== index) {
				const [movedClient] = allClients.splice(index, 1);
				if (movedClient) {
					allClients.splice(newIndex, 0, movedClient);
				}

				await ctx.db.transaction(async (tx) => {
					for (let i = 0; i < allClients.length; i++) {
						const client = allClients[i];
						if (!client) continue;
						await tx
							.update(schedulingClients)
							.set({ sort: i })
							.where(eq(schedulingClients.clientId, client.clientId));
					}
				});
			}
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

			await ctx.db
				.update(schedulingClients)
				.set({ archived: false, createdAt: new Date(), sort: nextSort })
				.where(eq(schedulingClients.clientId, input.clientId));
		}),
});

import { asc, eq, getTableColumns, sql } from "drizzle-orm";
import { z } from "zod";
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
			await syncPunchData(ctx.session, ctx.redis);
		}

		const allOffices = await db.query.offices.findMany();

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
					closestOfficeKey: closestOfficeKeyCase.mapWith(String),
				},
			})
			.from(schedulingClients)
			.innerJoin(clients, eq(schedulingClients.clientId, clients.id))
			.where(eq(schedulingClients.archived, false))
			.orderBy(asc(schedulingClients.createdAt));

		const allEvaluators = await db.query.evaluators.findMany();
		const allDistricts = await db.query.schoolDistricts.findMany();
		const allInsurances = await db.query.insurances.findMany({
			with: {
				aliases: true,
			},
		});

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
			await syncPunchData(ctx.session, ctx.redis);
		}

		const allOffices = await db.query.offices.findMany();

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
			.orderBy(asc(schedulingClients.createdAt));

		const allEvaluators = await db.query.evaluators.findMany();
		const allDistricts = await db.query.schoolDistricts.findMany();
		const allInsurances = await db.query.insurances.findMany({
			with: {
				aliases: true,
			},
		});

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
		.input(z.object({ clientId: z.number() }))
		.mutation(async ({ input }) => {
			await db
				.insert(schedulingClients)
				.values({
					clientId: input.clientId,
					archived: false,
				})
				.onDuplicateKeyUpdate({
					set: { archived: false, createdAt: new Date() },
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
			}),
		)
		.mutation(async ({ input }) => {
			const updateData: {
				evaluator?: number | null;
				date?: string;
				time?: string;
				office?: string;
				notes?: string;
				code?: string;
				color?: string | null;
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
			await db
				.update(schedulingClients)
				.set(updateData)
				.where(eq(schedulingClients.clientId, input.clientId));
		}),

	archive: protectedProcedure
		.input(z.object({ clientId: z.number() }))
		.mutation(async ({ input }) => {
			await db
				.update(schedulingClients)
				.set({ archived: true })
				.where(eq(schedulingClients.clientId, input.clientId));
		}),

	unarchive: protectedProcedure
		.input(z.object({ clientId: z.number() }))
		.mutation(async ({ input }) => {
			await db
				.update(schedulingClients)
				.set({ archived: false, createdAt: new Date() })
				.where(eq(schedulingClients.clientId, input.clientId));
		}),
});

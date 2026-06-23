import { and, asc, eq, getTableColumns, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { fetchWithCache } from "~/lib/cache";
import { getAvailabilityEvents, syncPunchData } from "~/lib/google";
import { getClosestOfficeKey, getDistanceSQL } from "~/lib/utils";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { db } from "~/server/db";
import {
	accounts,
	appointments,
	clients,
	clientsEvaluators,
	evaluators,
	schedulingClients,
	users,
} from "~/server/db/schema";

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

	getDashboard: protectedProcedure
		.input(z.object({ startDate: z.date(), endDate: z.date() }))
		.query(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "pages:scheduling");

			const allOffices = await fetchWithCache(ctx, "offices:all", () =>
				ctx.db.query.offices.findMany(),
			);

			const scheduledClients = await ctx.db
				.select({
					clientId: schedulingClients.clientId,
					office: schedulingClients.office,
					evaluator: schedulingClients.evaluator,
					notes: schedulingClients.notes,
					date: schedulingClients.date,
					time: schedulingClients.time,
					code: schedulingClients.code,
					color: schedulingClients.color,
					fullName: clients.fullName,
					asdAdhd: clients.asdAdhd,
					primaryInsurance: clients.primaryInsurance,
				})
				.from(schedulingClients)
				.innerJoin(clients, eq(schedulingClients.clientId, clients.id))
				.where(eq(schedulingClients.archived, false))
				.orderBy(asc(schedulingClients.sort), asc(schedulingClients.createdAt));

			if (scheduledClients.length === 0) {
				return { clients: [], offices: allOffices };
			}

			const clientIds = scheduledClients.map((c) => c.clientId);

			const [eligibilityRows, existingAppointments] = await Promise.all([
				ctx.db
					.select({
						clientId: clientsEvaluators.clientId,
						evaluatorNpi: clientsEvaluators.evaluatorNpi,
					})
					.from(clientsEvaluators)
					.where(inArray(clientsEvaluators.clientId, clientIds)),
				ctx.db
					.select({
						clientId: appointments.clientId,
						daEval: appointments.daEval,
					})
					.from(appointments)
					.where(
						and(
							inArray(appointments.clientId, clientIds),
							eq(appointments.cancelled, false),
							eq(appointments.rescheduled, false),
							eq(appointments.placeholder, false),
							eq(appointments.billingOnly, false),
						),
					),
			]);

			const apptsByClientId = new Map<number, { daEval: string | null }[]>();
			for (const appt of existingAppointments) {
				const existing = apptsByClientId.get(appt.clientId) ?? [];
				existing.push({ daEval: appt.daEval ?? null });
				apptsByClientId.set(appt.clientId, existing);
			}

			function hasMatchingAppt(clientId: number, code: string | null): boolean {
				return (apptsByClientId.get(clientId) ?? []).some((a) => {
					if (!a.daEval) return false;
					if (code === "90791")
						return a.daEval === "DA" || a.daEval === "DAEVAL";
					if (code === "96136")
						return a.daEval === "EVAL" || a.daEval === "DAEVAL";
					return false;
				});
			}

			const uniqueNpis = [
				...new Set(eligibilityRows.map((r) => r.evaluatorNpi)),
			];

			if (uniqueNpis.length === 0) {
				return {
					clients: scheduledClients.map((sc) => ({
						clientId: sc.clientId,
						fullName: sc.fullName,
						office: sc.office,
						asdAdhd: sc.asdAdhd,
						primaryInsurance: sc.primaryInsurance,
						evaluatorNpi: sc.evaluator,
						notes: sc.notes,
						date: sc.date,
						time: sc.time,
						hasMatchingAppointment: hasMatchingAppt(
							sc.clientId,
							sc.code ?? null,
						),
						eligibleEvaluators: [],
					})),
					offices: allOffices,
				};
			}

			const allEvaluators = await fetchWithCache(
				ctx,
				"evaluators:all",
				async () => {
					const rows = await ctx.db.query.evaluators.findMany({
						where: ne(evaluators.archived, true),
						orderBy: (ev, { asc }) => [asc(ev.providerName)],
						with: {
							offices: { with: { office: true } },
							blockedSchoolDistricts: { with: { schoolDistrict: true } },
							blockedZipCodes: { with: { zipCode: true } },
							insurances: { with: { insurance: true } },
						},
					});
					return rows.map((e) => ({
						...e,
						offices: e.offices.map((link) => link.office),
						blockedDistricts: e.blockedSchoolDistricts.map(
							(link) => link.schoolDistrict,
						),
						blockedZips: e.blockedZipCodes.map((link) => link.zipCode),
						insurances: e.insurances.map((link) => link.insurance),
					}));
				},
			);

			const uniqueNpisSet = new Set(uniqueNpis);
			const evaluatorMap = new Map(
				allEvaluators
					.filter((e) => uniqueNpisSet.has(e.npi))
					.map((e) => [e.npi, e]),
			);

			// Fetch OAuth tokens for eligible evaluators' users
			const eligibleEmails = [...evaluatorMap.values()].map((e) => e.email);
			const userRows = await ctx.db
				.select({ id: users.id, email: users.email })
				.from(users)
				.where(inArray(users.email, eligibleEmails));

			const userIds = userRows.map((u) => u.id);
			const accountRows =
				userIds.length > 0
					? await ctx.db
							.select({
								userId: accounts.userId,
								access_token: accounts.access_token,
								refresh_token: accounts.refresh_token,
							})
							.from(accounts)
							.where(
								and(
									inArray(accounts.userId, userIds),
									eq(accounts.provider, "google"),
								),
							)
					: [];

			const userIdToEmail = new Map(userRows.map((u) => [u.id, u.email]));
			const emailToTokens = new Map(
				accountRows.flatMap((a) =>
					a.access_token && a.refresh_token
						? [
								[
									userIdToEmail.get(a.userId) ?? "",
									{
										access_token: a.access_token,
										refresh_token: a.refresh_token,
									},
								] as const,
							]
						: [],
				),
			);

			// Fetch availability for all eligible evaluators in parallel
			const availabilityByNpi = new Map<
				number,
				Awaited<ReturnType<typeof getAvailabilityEvents>>
			>();
			await Promise.all(
				[...evaluatorMap.values()].map(async (evaluator) => {
					const tokens = emailToTokens.get(evaluator.email);
					if (!tokens) {
						availabilityByNpi.set(evaluator.npi, []);
						return;
					}
					const mockSession = {
						user: {
							accessToken: tokens.access_token,
							refreshToken: tokens.refresh_token,
						},
					} as Parameters<typeof getAvailabilityEvents>[0];
					try {
						const events = await getAvailabilityEvents(
							mockSession,
							input.startDate,
							input.endDate,
						);
						availabilityByNpi.set(evaluator.npi, events);
					} catch {
						availabilityByNpi.set(evaluator.npi, []);
					}
				}),
			);

			// Group eligibility rows by client
			const eligibilityByClientId = new Map<number, number[]>();
			for (const row of eligibilityRows) {
				const existing = eligibilityByClientId.get(row.clientId) ?? [];
				existing.push(row.evaluatorNpi);
				eligibilityByClientId.set(row.clientId, existing);
			}

			return {
				clients: scheduledClients.map((sc) => {
					const preferredOffice = sc.office;
					const eligibleNpis = eligibilityByClientId.get(sc.clientId) ?? [];

					const eligibleEvaluators = eligibleNpis
						.map((npi) => {
							const evaluator = evaluatorMap.get(npi);
							if (!evaluator) return null;

							const events = availabilityByNpi.get(npi) ?? [];
							const availableEvents = events.filter((e) => !e.isUnavailability);

							const matchingEvents = preferredOffice
								? availableEvents.filter((e) =>
										e.officeKeys?.includes(preferredOffice),
									)
								: [];

							const otherEvents = preferredOffice
								? availableEvents.filter(
										(e) => !(e.officeKeys?.includes(preferredOffice) ?? false),
									)
								: availableEvents;

							return {
								npi: evaluator.npi,
								providerName: evaluator.providerName,
								hasCalendarAccess: emailToTokens.has(evaluator.email),
								matchingEvents,
								otherEvents,
							};
						})
						.filter((e): e is NonNullable<typeof e> => e !== null)
						.sort((a, b) => {
							const aScore =
								a.matchingEvents.length > 0
									? 2
									: a.otherEvents.length > 0
										? 1
										: 0;
							const bScore =
								b.matchingEvents.length > 0
									? 2
									: b.otherEvents.length > 0
										? 1
										: 0;
							if (aScore !== bScore) return bScore - aScore;
							return a.providerName.localeCompare(b.providerName);
						});

					return {
						clientId: sc.clientId,
						fullName: sc.fullName,
						office: preferredOffice,
						asdAdhd: sc.asdAdhd,
						primaryInsurance: sc.primaryInsurance,
						evaluatorNpi: sc.evaluator,
						notes: sc.notes,
						date: sc.date,
						time: sc.time,
						hasMatchingAppointment: hasMatchingAppt(
							sc.clientId,
							sc.code ?? null,
						),
						eligibleEvaluators,
					};
				}),
				offices: allOffices,
			};
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

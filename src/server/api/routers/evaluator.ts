import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import z from "zod";
import { fetchWithCache, invalidateCache } from "~/lib/cache";
import { logger } from "~/lib/logger";
import { hasPermission } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	blockedSchoolDistricts,
	blockedZipCodes,
	clients,
	evaluatorOffices,
	evaluators,
	evaluatorsToInsurances,
	zipCodes,
} from "~/server/db/schema";

const log = logger.child({ module: "EvaluatorApi" });

export const evaluatorInputSchema = z.object({
	npi: z.string().regex(/^\d{10}$/),
	providerName: z.string().min(1),
	email: z.email(),
	insurances: z.array(z.number()).default([]),
	districts: z.string().default(""),
	offices: z.array(z.string()).default([]),
	blockedDistricts: z.array(z.number()).default([]),
	blockedZips: z.array(z.string().regex(/^\d{5}$/)).default([]),
});

const CACHE_KEY_ALL_EVALUATORS = "evaluators:all";

export const evaluatorRouter = createTRPCRouter({
	getAll: protectedProcedure.query(async ({ ctx }) => {
		return fetchWithCache(ctx, CACHE_KEY_ALL_EVALUATORS, async () => {
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
		});
	}),

	getEligibleForClient: protectedProcedure
		.input(z.number())
		.query(async ({ ctx, input }) => {
			const clientWithEvaluators = await ctx.db.query.clients.findFirst({
				where: eq(clients.id, input),
				with: {
					clientsEvaluators: {
						with: {
							evaluator: {
								with: {
									offices: { with: { office: true } },
									blockedSchoolDistricts: {
										with: { schoolDistrict: true },
									},
									blockedZipCodes: { with: { zipCode: true } },
									insurances: { with: { insurance: true } },
								},
							},
						},
					},
				},
			});

			if (!clientWithEvaluators) {
				return null;
			}

			// Map and format the data in a flattened structure
			const correctedEvaluatorsByClient = clientWithEvaluators.clientsEvaluators
				.map((link) => {
					const evaluator = link.evaluator;
					return {
						...evaluator,
						offices: evaluator.offices.map((officeLink) => officeLink.office),
						blockedDistricts: evaluator.blockedSchoolDistricts.map(
							(districtLink) => districtLink.schoolDistrict,
						),
						blockedZips: evaluator.blockedZipCodes.map(
							(zipLink) => zipLink.zipCode,
						),
						insurances: evaluator.insurances.map((link) => link.insurance),
					};
				})
				.sort((a, b) => a.providerName.localeCompare(b.providerName));

			return correctedEvaluatorsByClient;
		}),

	create: protectedProcedure
		.input(
			z.object({
				...evaluatorInputSchema.shape,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!hasPermission(ctx.session.user.permissions, "settings:evaluators")) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			log.info(
				{ user: ctx.session.user.email, ...input },
				"Creating evaluator",
			);

			const npiAsInt = parseInt(input.npi, 10);
			const {
				offices,
				blockedDistricts,
				blockedZips,
				insurances: insuranceIds,
				...evaluatorData
			} = input;

			const result = await ctx.db.transaction(async (tx) => {
				await tx.insert(evaluators).values({
					...evaluatorData,
					npi: npiAsInt,
				});

				// Link offices
				if (offices.length > 0) {
					await tx.insert(evaluatorOffices).values(
						offices.map((officeKey) => ({
							evaluatorNpi: npiAsInt,
							officeKey,
						})),
					);
				}

				// Link insurances
				if (insuranceIds.length > 0) {
					await tx.insert(evaluatorsToInsurances).values(
						insuranceIds.map((insuranceId) => ({
							evaluatorNpi: npiAsInt,
							insuranceId,
						})),
					);
				}

				// Link blocked districts
				if (blockedDistricts.length > 0) {
					await tx.insert(blockedSchoolDistricts).values(
						blockedDistricts.map((schoolDistrictId) => ({
							evaluatorNpi: npiAsInt,
							schoolDistrictId,
						})),
					);
				}

				// Ensure zip codes exist and link them
				if (blockedZips.length > 0) {
					// Ensure all zip codes exist in the main table, ignoring duplicates
					await tx
						.insert(zipCodes)
						.values(blockedZips.map((zip) => ({ zip })))
						.onDuplicateKeyUpdate({ set: { zip: sql`zip` } });
					// Link the evaluator to the blocked zip codes
					await tx.insert(blockedZipCodes).values(
						blockedZips.map((zipCode) => ({
							evaluatorNpi: npiAsInt,
							zipCode,
						})),
					);
				}
			});

			await invalidateCache(ctx, CACHE_KEY_ALL_EVALUATORS);

			return result;
		}),

	update: protectedProcedure
		.input(evaluatorInputSchema)
		.mutation(async ({ ctx, input }) => {
			if (!hasPermission(ctx.session.user.permissions, "settings:evaluators")) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			log.info(
				{ user: ctx.session.user.email, ...input },
				"Updating evaluator",
			);

			const npiAsInt = parseInt(input.npi, 10);
			const {
				offices,
				blockedDistricts,
				blockedZips,
				insurances: insuranceIds,
				...evaluatorData
			} = input;

			const result = await ctx.db.transaction(async (tx) => {
				// Update core evaluator data
				await tx
					.update(evaluators)
					.set({ ...evaluatorData, npi: npiAsInt })
					.where(eq(evaluators.npi, npiAsInt));

				// Delete all existing relationships
				await tx
					.delete(evaluatorOffices)
					.where(eq(evaluatorOffices.evaluatorNpi, npiAsInt));
				await tx
					.delete(evaluatorsToInsurances)
					.where(eq(evaluatorsToInsurances.evaluatorNpi, npiAsInt));
				await tx
					.delete(blockedSchoolDistricts)
					.where(eq(blockedSchoolDistricts.evaluatorNpi, npiAsInt));
				await tx
					.delete(blockedZipCodes)
					.where(eq(blockedZipCodes.evaluatorNpi, npiAsInt));

				// Re-insert offices
				if (offices && offices.length > 0) {
					const officeRelationships = offices.map((officeKey) => ({
						evaluatorNpi: npiAsInt,
						officeKey: officeKey,
					}));
					await tx.insert(evaluatorOffices).values(officeRelationships);
				}

				// Re-insert insurances
				if (insuranceIds.length > 0) {
					await tx.insert(evaluatorsToInsurances).values(
						insuranceIds.map((insuranceId) => ({
							evaluatorNpi: npiAsInt,
							insuranceId,
						})),
					);
				}

				// Re-insert blocked districts
				if (blockedDistricts.length > 0) {
					await tx.insert(blockedSchoolDistricts).values(
						blockedDistricts.map((schoolDistrictId) => ({
							evaluatorNpi: npiAsInt,
							schoolDistrictId,
						})),
					);
				}

				// Ensure zip codes exist and re-insert blocked zips
				if (blockedZips.length > 0) {
					// Ensure all zip codes exist in the main table, ignoring duplicates
					await tx
						.insert(zipCodes)
						.values(blockedZips.map((zip) => ({ zip })))
						.onDuplicateKeyUpdate({ set: { zip: sql`zip` } });
					// Link the evaluator to the blocked zip codes
					await tx.insert(blockedZipCodes).values(
						blockedZips.map((zipCode) => ({
							evaluatorNpi: npiAsInt,
							zipCode,
						})),
					);
				}
			});

			await invalidateCache(ctx, CACHE_KEY_ALL_EVALUATORS);

			return result;
		}),

	delete: protectedProcedure
		.input(z.object({ npi: z.string() }))
		.mutation(async ({ ctx, input }) => {
			if (!hasPermission(ctx.session.user.permissions, "settings:evaluators")) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			log.info(
				{ user: ctx.session.user.email, ...input },
				"Deleting evaluator",
			);

			const npiAsInt = parseInt(input.npi, 10);

			await ctx.db.delete(evaluators).where(eq(evaluators.npi, npiAsInt));

			try {
				await ctx.redis.del("evaluators:all");
				log.debug({ cacheKey: "evaluators:all" }, "Cache invalidated");
			} catch (err) {
				log.error(err);
			}
		}),

	getAllZipCodes: protectedProcedure.query(async ({ ctx }) => {
		return ctx.db.query.zipCodes.findMany({
			orderBy: (zipCodes, { asc }) => [asc(zipCodes.zip)],
		});
	}),

	getAllSchoolDistricts: protectedProcedure.query(async ({ ctx }) => {
		return ctx.db.query.schoolDistricts.findMany({
			orderBy: (schoolDistricts, { asc, sql }) => [
				sql`CASE WHEN ${schoolDistricts.shortName} IS NOT NULL THEN 0 ELSE 1 END`,
				asc(schoolDistricts.shortName),
				asc(schoolDistricts.fullName),
			],
		});
	}),
});

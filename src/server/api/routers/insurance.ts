import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { hasPermission } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { clients, insuranceAliases, insurances } from "~/server/db/schema";

export const insuranceRouter = createTRPCRouter({
	getAll: protectedProcedure.query(async ({ ctx }) => {
		return ctx.db.query.insurances.findMany({
			orderBy: (insurances, { asc }) => [asc(insurances.shortName)],
			with: {
				aliases: true,
			},
		});
	}),

	getUniqueNamesFromClients: protectedProcedure.query(async ({ ctx }) => {
		const primaryInsurances = await ctx.db
			.selectDistinct({ name: clients.primaryInsurance })
			.from(clients);

		const secondaryInsurances = await ctx.db
			.selectDistinct({ name: clients.secondaryInsurance })
			.from(clients);

		const allNames = new Set<string>();
		for (const row of primaryInsurances) {
			if (row.name) allNames.add(row.name);
		}
		for (const row of secondaryInsurances) {
			if (row.name) allNames.add(row.name);
		}

		return Array.from(allNames).sort();
	}),

	create: protectedProcedure
		.input(
			z.object({
				shortName: z.string().min(1),
				preAuthNeeded: z.boolean().default(false),
				preAuthLockin: z.boolean().default(false),
				appointmentsRequired: z.number().int().min(1).default(1),
				aliases: z.array(z.string()).default([]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!hasPermission(ctx.session.user.permissions, "settings:evaluators")) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			const { aliases, ...insuranceData } = input;

			return ctx.db.transaction(async (tx) => {
				const [result] = await tx.insert(insurances).values(insuranceData);
				const insuranceId = result.insertId;

				if (aliases.length > 0) {
					await tx.insert(insuranceAliases).values(
						aliases.map((name) => ({
							name,
							insuranceId,
						})),
					);
				}

				return result;
			});
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.number(),
				shortName: z.string().min(1),
				preAuthNeeded: z.boolean(),
				preAuthLockin: z.boolean(),
				appointmentsRequired: z.number().int().min(1),
				aliases: z.array(z.string()).default([]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!hasPermission(ctx.session.user.permissions, "settings:evaluators")) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			const { id, aliases, ...data } = input;

			return ctx.db.transaction(async (tx) => {
				await tx.update(insurances).set(data).where(eq(insurances.id, id));

				// Simple sync: delete all and re-insert
				await tx
					.delete(insuranceAliases)
					.where(eq(insuranceAliases.insuranceId, id));

				if (aliases.length > 0) {
					await tx.insert(insuranceAliases).values(
						aliases.map((name) => ({
							name,
							insuranceId: id,
						})),
					);
				}
			});
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			if (!hasPermission(ctx.session.user.permissions, "settings:evaluators")) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			return ctx.db.delete(insurances).where(eq(insurances.id, input.id));
		}),
});

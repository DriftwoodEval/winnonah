import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { hasPermission } from "~/lib/utils";
import {
	appointmentSyncConfigSchema,
	pythonConfigSchema,
} from "~/lib/validations/config";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { pythonConfig } from "~/server/db/schema";

export const pyConfigRouter = createTRPCRouter({
	get: protectedProcedure.query(async ({ ctx }) => {
		const record = await ctx.db.query.pythonConfig.findFirst({
			where: eq(pythonConfig.id, 1),
		});

		if (!record?.data) return null;
		const result = pythonConfigSchema.safeParse(record.data);
		return result.success ? result.data : null;
	}),

	getServices: protectedProcedure.query(async ({ ctx }) => {
		const perms = ctx.session.user.permissions;
		if (
			!hasPermission(perms, "settings:qsuite:services") &&
			!hasPermission(perms, "settings:qsuite:services:view")
		) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message:
					"You don't have permission to view QSuite services credentials",
			});
		}

		const record = await ctx.db.query.pythonConfig.findFirst({
			where: eq(pythonConfig.id, 1),
		});

		if (!record?.data) return null;
		const result = pythonConfigSchema.safeParse(record.data);
		if (!result.success) return null;

		const { therapyappointment, ...services } = result.data.services;
		return services;
	}),

	update: protectedProcedure
		.input(pythonConfigSchema)
		.mutation(async ({ ctx, input }) => {
			ctx.logger.info(
				{ ...input, updatedBy: ctx.session.user.email },
				"Updating Python config",
			);
			await ctx.db
				.insert(pythonConfig)
				.values({ id: 1, data: input })
				.onDuplicateKeyUpdate({ set: { data: input } });

			return { success: true };
		}),

	getSync: protectedProcedure.query(async ({ ctx }) => {
		const record = await ctx.db.query.pythonConfig.findFirst({
			where: eq(pythonConfig.id, 2),
		});

		if (record?.data) {
			const result = appointmentSyncConfigSchema.safeParse(record.data);
			if (result.success) return result.data;
		}

		return {
			trusted_appointment_ids: [],
			ignored_appointment_ids: [],
		};
	}),

	updateSync: protectedProcedure
		.input(appointmentSyncConfigSchema)
		.mutation(async ({ ctx, input }) => {
			ctx.logger.info(
				{ ...input, updatedBy: ctx.session.user.email },
				"Updating Python appointment sync config",
			);
			await ctx.db
				.insert(pythonConfig)
				.values({ id: 2, data: input })
				.onDuplicateKeyUpdate({ set: { data: input } });

			return { success: true };
		}),
});

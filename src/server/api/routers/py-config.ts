import { eq } from "drizzle-orm";
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

	update: protectedProcedure
		.input(pythonConfigSchema)
		.mutation(async ({ ctx, input }) => {
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
			await ctx.db
				.insert(pythonConfig)
				.values({ id: 2, data: input })
				.onDuplicateKeyUpdate({ set: { data: input } });

			return { success: true };
		}),
});

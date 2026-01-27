import { eq } from "drizzle-orm";
import { pythonConfigSchema } from "~/lib/validations";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { pythonConfig } from "~/server/db/schema";

export const pyConfigRouter = createTRPCRouter({
	get: protectedProcedure.query(async ({ ctx }) => {
		const record = await ctx.db.query.pythonConfig.findFirst({
			where: eq(pythonConfig.id, 1),
		});

		return record?.data ?? null;
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
});

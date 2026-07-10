import { eq } from "drizzle-orm";
import z from "zod";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { reportQueueConfig } from "~/server/db/schema";

export const reportQueueRouter = createTRPCRouter({
	getConfig: protectedProcedure.query(async ({ ctx }) => {
		const record = await ctx.db.query.reportQueueConfig.findFirst({
			where: eq(reportQueueConfig.id, 1),
		});
		return {
			defaultMaxClaimedReports: record?.defaultMaxClaimedReports ?? 1,
		};
	}),

	setConfig: protectedProcedure
		.input(
			z.object({
				defaultMaxClaimedReports: z.number().int().min(1).max(10),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "reports:approve");
			ctx.logger.info(
				{ ...input, updatedBy: ctx.session.user.email },
				"Updating report queue config",
			);
			await ctx.db
				.insert(reportQueueConfig)
				.values({
					id: 1,
					defaultMaxClaimedReports: input.defaultMaxClaimedReports,
				})
				.onDuplicateKeyUpdate({
					set: { defaultMaxClaimedReports: input.defaultMaxClaimedReports },
				});
			return { success: true };
		}),
});

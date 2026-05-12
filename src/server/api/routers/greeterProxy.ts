import { eq } from "drizzle-orm";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { greeterProxyState, users } from "~/server/db/schema";

const LAST_ACTIVE_EVALUATOR_KEY = "last_active_evaluator";

export const greeterProxyRouter = createTRPCRouter({
	getStatus: protectedProcedure.query(async ({ ctx }) => {
		assertPermission(ctx.session.user, "settings:greeter-proxy");
		const stateRows = await ctx.db
			.select()
			.from(greeterProxyState)
			.where(eq(greeterProxyState.key, LAST_ACTIVE_EVALUATOR_KEY));

		const activePhone = stateRows[0]?.value ?? null;
		if (!activePhone) return { active: false, evaluator: null };

		const evaluatorRows = await ctx.db
			.select({
				id: users.id,
				name: users.name,
				phoneNumber: users.phoneNumber,
			})
			.from(users)
			.where(eq(users.phoneNumber, activePhone));

		return { active: true, evaluator: evaluatorRows[0] ?? null };
	}),

	resetStatus: protectedProcedure.mutation(async ({ ctx }) => {
		assertPermission(ctx.session.user, "settings:greeter-proxy");
		await ctx.db
			.delete(greeterProxyState)
			.where(eq(greeterProxyState.key, LAST_ACTIVE_EVALUATOR_KEY));
	}),
});

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { getContactTimeline, getOpenPhoneUsers } from "~/lib/quo";
import { normalizePhoneNumber } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { pythonConfig } from "~/server/db/schema";

export const quoRouter = createTRPCRouter({
	getQuoUsers: protectedProcedure
		.input(z.object({ apiKey: z.string().optional() }))
		.mutation(async ({ ctx, input }) => {
			let apiKey = input.apiKey;

			if (!apiKey) {
				const record = await ctx.db.query.pythonConfig.findFirst({
					where: eq(pythonConfig.id, 1),
				});
				apiKey = record?.data.services.openphone.key;
			}

			if (!apiKey) {
				apiKey = env.OPENPHONE_API_TOKEN;
			}

			if (!apiKey) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "OpenPhone API key is required",
				});
			}

			try {
				return await getOpenPhoneUsers(apiKey);
			} catch (e) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: e instanceof Error ? e.message : "Unknown error",
				});
			}
		}),

	getContactTimeline: protectedProcedure
		.input(z.object({ phoneNumber: z.string() }))
		.query(async ({ input }) => {
			const apiKey = env.OPENPHONE_API_TOKEN;
			const phoneNumberId = env.OPENPHONE_NUMBER_ID;

			if (!apiKey || !phoneNumberId) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "OpenPhone configuration missing in environment",
				});
			}

			try {
				const normalized = normalizePhoneNumber(input.phoneNumber);
				return await getContactTimeline(apiKey, phoneNumberId, normalized);
			} catch (e) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: e instanceof Error ? e.message : "Unknown error",
				});
			}
		}),
});

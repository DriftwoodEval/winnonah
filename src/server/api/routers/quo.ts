import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "~/env";
import { getContactTimeline, getOpenPhoneUsers, sendMessage } from "~/lib/quo";
import { normalizePhoneNumber } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const quoRouter = createTRPCRouter({
	getQuoUsers: protectedProcedure.query(async () => {
		const apiKey = env.OPENPHONE_API_TOKEN;
		const phoneNumberId = env.OPENPHONE_NUMBER_ID;

		if (!apiKey || !phoneNumberId) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "OpenPhone configuration missing in environment",
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

	sendMessage: protectedProcedure
		.input(z.object({ phoneNumber: z.string(), message: z.string() }))
		.mutation(async ({ ctx, input }) => {
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

				const openPhoneUsers = await getOpenPhoneUsers(apiKey);

				const loggedInName = ctx.session.user.name?.toLowerCase().trim();
				const matchedUser = openPhoneUsers.find(
					(u) => u.name.toLowerCase().trim() === loggedInName,
				);

				return await sendMessage(
					apiKey,
					phoneNumberId,
					normalized,
					input.message,
					matchedUser?.id,
				);
			} catch (e) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: e instanceof Error ? e.message : "Unknown error",
				});
			}
		}),
});

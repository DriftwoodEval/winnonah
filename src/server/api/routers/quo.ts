import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { fetchWithCache } from "~/lib/cache";
import { getContactTimeline, getOpenPhoneUsers, sendMessage } from "~/lib/quo";
import { normalizePhoneNumber } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	clients,
	questionnaireMsgLogs,
	referralMsgLog,
	reminderLogs,
	reminderTemplates,
} from "~/server/db/schema";

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
		.query(async ({ ctx, input }) => {
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
				return await fetchWithCache(
					ctx,
					`quo:timeline:${normalized}`,
					() => getContactTimeline(apiKey, phoneNumberId, normalized),
					60,
				);
			} catch (e) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: e instanceof Error ? e.message : "Unknown error",
				});
			}
		}),

	getAutomatedMessageContext: protectedProcedure
		.input(z.object({ messageIds: z.array(z.string()) }))
		.query(async ({ ctx, input }) => {
			if (input.messageIds.length === 0) return [];

			const [apptRows, qRows, referralRows] = await Promise.all([
				ctx.db
					.select({
						openphoneMessageId: reminderLogs.openphoneMessageId,
						clientFullName: clients.fullName,
						clientHash: clients.hash,
						reason: reminderTemplates.name,
					})
					.from(reminderLogs)
					.innerJoin(clients, eq(clients.id, reminderLogs.clientId))
					.innerJoin(
						reminderTemplates,
						eq(reminderTemplates.id, reminderLogs.reminderTemplateId),
					)
					.where(inArray(reminderLogs.openphoneMessageId, input.messageIds)),
				ctx.db
					.select({
						openphoneMessageId: questionnaireMsgLogs.openphoneMessageId,
						clientFullName: clients.fullName,
						clientHash: clients.hash,
						isFailureReminder: questionnaireMsgLogs.isFailureReminder,
						failureReason: questionnaireMsgLogs.failureReason,
					})
					.from(questionnaireMsgLogs)
					.innerJoin(clients, eq(clients.id, questionnaireMsgLogs.clientId))
					.where(
						inArray(questionnaireMsgLogs.openphoneMessageId, input.messageIds),
					),
				ctx.db
					.select({
						openphoneMessageId: referralMsgLog.openphoneMessageId,
						clientFullName: clients.fullName,
						clientHash: clients.hash,
					})
					.from(referralMsgLog)
					.innerJoin(clients, eq(clients.id, referralMsgLog.clientId))
					.where(inArray(referralMsgLog.openphoneMessageId, input.messageIds)),
			]);

			type AutomatedContext = {
				openphoneMessageId: string;
				clientFullName: string;
				clientHash: string;
				reason: string;
			};

			const results: AutomatedContext[] = [];

			for (const row of apptRows) {
				if (!row.openphoneMessageId) continue;
				results.push({
					openphoneMessageId: row.openphoneMessageId,
					clientFullName: row.clientFullName,
					clientHash: row.clientHash,
					reason: row.reason,
				});
			}

			for (const row of qRows) {
				results.push({
					openphoneMessageId: row.openphoneMessageId,
					clientFullName: row.clientFullName,
					clientHash: row.clientHash,
					reason: row.isFailureReminder
						? `Follow-up: ${row.failureReason ?? "unknown"}`
						: "Questionnaire reminder",
				});
			}

			for (const row of referralRows) {
				if (!row.openphoneMessageId) continue;
				results.push({
					openphoneMessageId: row.openphoneMessageId,
					clientFullName: row.clientFullName,
					clientHash: row.clientHash,
					reason: "New referral received",
				});
			}

			return results;
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

				ctx.logger.info(
					{ phoneNumber: normalized, sentBy: ctx.session.user.email },
					"Sending OpenPhone message",
				);

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

import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { fetchWithCache } from "~/lib/cache";
import {
	getContactTimeline,
	getQuoUsers,
	getRecentMessages,
	sendMessage,
	type TimelineEvent,
} from "~/lib/quo";
import { normalizePhoneNumber } from "~/lib/utils";
import {
	assertPermission,
	type Context,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import {
	clients,
	questionnaireMsgLogs,
	referralMsgLog,
	reminderLogs,
	reminderTemplates,
} from "~/server/db/schema";

type AutomatedContext = {
	openphoneMessageId: string;
	clientFullName: string;
	clientHash: string;
	reason: string;
};

const REMINDER_PLACEHOLDER_TOKENS = [
	"$START_TIME",
	"$DATE",
	"$OFFICE_NAME",
	"$LOCATION",
];

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildReminderTemplateRegex(template: string): RegExp {
	const splitRegex = new RegExp(
		`(${REMINDER_PLACEHOLDER_TOKENS.map(escapeRegExp).join("|")})`,
	);
	const pattern = template
		.split(splitRegex)
		.map((part) =>
			REMINDER_PLACEHOLDER_TOKENS.includes(part) ? ".*?" : escapeRegExp(part),
		)
		.join("");
	return new RegExp(`^${pattern}$`, "s");
}

async function fetchAutomatedMessageContext(
	db: Context["db"],
	messageIds: string[],
): Promise<AutomatedContext[]> {
	if (messageIds.length === 0) return [];

	const [apptRows, qRows, referralRows] = await Promise.all([
		db
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
			.where(inArray(reminderLogs.openphoneMessageId, messageIds)),
		db
			.select({
				openphoneMessageId: questionnaireMsgLogs.openphoneMessageId,
				clientFullName: clients.fullName,
				clientHash: clients.hash,
				isFailureReminder: questionnaireMsgLogs.isFailureReminder,
				failureReason: questionnaireMsgLogs.failureReason,
			})
			.from(questionnaireMsgLogs)
			.innerJoin(clients, eq(clients.id, questionnaireMsgLogs.clientId))
			.where(inArray(questionnaireMsgLogs.openphoneMessageId, messageIds)),
		db
			.select({
				openphoneMessageId: referralMsgLog.openphoneMessageId,
				clientFullName: clients.fullName,
				clientHash: clients.hash,
			})
			.from(referralMsgLog)
			.innerJoin(clients, eq(clients.id, referralMsgLog.clientId))
			.where(inArray(referralMsgLog.openphoneMessageId, messageIds)),
	]);

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
}

export const quoRouter = createTRPCRouter({
	getQuoUsers: protectedProcedure.query(async () => {
		const apiKey = env.OPENPHONE_API_TOKEN;
		const phoneNumberId = env.OPENPHONE_NUMBER_ID;

		if (!apiKey || !phoneNumberId) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: "Quo configuration missing in environment",
			});
		}

		try {
			return await getQuoUsers(apiKey);
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
					message: "Quo configuration missing in environment",
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

	getRecentMessages: protectedProcedure
		.input(z.object({ phoneNumbers: z.array(z.string()) }))
		.query(async ({ ctx, input }) => {
			const apiKey = env.OPENPHONE_API_TOKEN;
			const phoneNumberId = env.OPENPHONE_NUMBER_ID;

			if (!apiKey || !phoneNumberId) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Quo configuration missing in environment",
				});
			}

			const normalizedNumbers = [
				...new Set(input.phoneNumbers.map(normalizePhoneNumber)),
			];

			// Fetch a larger raw window than we intend to display, since
			// automated messages get filtered out and shouldn't eat into the
			// "3 real messages" limit.
			const RAW_FETCH_LIMIT = 10;
			const KEPT_REGULAR_LIMIT = 3;
			const MAX_AUTOMATED_SHOWN = 5;

			const rawByPhone = new Map<string, TimelineEvent[]>();
			const CONCURRENCY = 5;

			for (let i = 0; i < normalizedNumbers.length; i += CONCURRENCY) {
				const batch = normalizedNumbers.slice(i, i + CONCURRENCY);
				const messages = await Promise.all(
					batch.map((phone) =>
						fetchWithCache(
							ctx,
							`quo:recent:${phone}`,
							() =>
								getRecentMessages(
									apiKey,
									phoneNumberId,
									phone,
									RAW_FETCH_LIMIT,
								),
							60,
						).catch((err) => {
							ctx.logger.error(
								{ phoneNumber: phone, error: err },
								"Failed to fetch recent Quo messages",
							);
							return [] as TimelineEvent[];
						}),
					),
				);
				batch.forEach((phone, idx) => {
					rawByPhone.set(phone, messages[idx] ?? []);
				});
			}

			const outgoingIds = [...rawByPhone.values()]
				.flat()
				.filter((m) => m.direction === "outgoing")
				.map((m) => m.id);

			const [automatedContext, templateRows] = await Promise.all([
				fetchAutomatedMessageContext(ctx.db, outgoingIds),
				ctx.db
					.select({
						name: reminderTemplates.name,
						messageTemplate: reminderTemplates.messageTemplate,
						confirmationReply: reminderTemplates.confirmationReply,
					})
					.from(reminderTemplates),
			]);
			const automatedReasonById = new Map(
				automatedContext.map((c) => [c.openphoneMessageId, c.reason]),
			);
			const templateMatchers: { name: string; regex: RegExp }[] = [];
			for (const t of templateRows) {
				templateMatchers.push({
					name: t.name,
					regex: buildReminderTemplateRegex(t.messageTemplate),
				});
				if (t.confirmationReply) {
					templateMatchers.push({
						name: `${t.name} confirmation`,
						regex: buildReminderTemplateRegex(t.confirmationReply),
					});
				}
			}

			function matchReminderTemplate(text: string | undefined) {
				if (!text) return undefined;
				return templateMatchers.find((t) => t.regex.test(text))?.name;
			}

			const result: Record<
				string,
				(TimelineEvent & { isAutomated: boolean; reason?: string })[]
			> = {};

			for (const [phone, raw] of rawByPhone) {
				const tagged = raw.map((m) => {
					const reason =
						automatedReasonById.get(m.id) ??
						(m.direction === "outgoing"
							? matchReminderTemplate(m.text)
							: undefined);
					return { ...m, isAutomated: !!reason, reason };
				});

				const regular = tagged.filter((m) => !m.isAutomated);
				const kept = regular.slice(-KEPT_REGULAR_LIMIT);
				const cutoff = kept[0]?.createdAt;

				const automated = tagged
					.filter((m) => m.isAutomated)
					.filter((m) => !cutoff || m.createdAt >= cutoff)
					.slice(-MAX_AUTOMATED_SHOWN);

				result[phone] = [...kept, ...automated].sort((a, b) =>
					a.createdAt.localeCompare(b.createdAt),
				);
			}

			return result;
		}),

	getAutomatedMessageContext: protectedProcedure
		.input(z.object({ messageIds: z.array(z.string()) }))
		.query(async ({ ctx, input }) =>
			fetchAutomatedMessageContext(ctx.db, input.messageIds),
		),

	sendMessage: protectedProcedure
		.input(z.object({ phoneNumber: z.string(), message: z.string() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:referral:fillout");

			const apiKey = env.OPENPHONE_API_TOKEN;
			const phoneNumberId = env.OPENPHONE_NUMBER_ID;

			if (!apiKey || !phoneNumberId) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Quo configuration missing in environment",
				});
			}

			try {
				const normalized = normalizePhoneNumber(input.phoneNumber);

				ctx.logger.info(
					{ phoneNumber: normalized, sentBy: ctx.session.user.email },
					"Sending Quo message",
				);

				const quoUsers = await getQuoUsers(apiKey);

				const loggedInName = ctx.session.user.name?.toLowerCase().trim();
				const matchedUser = quoUsers.find(
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

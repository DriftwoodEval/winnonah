import { TRPCError } from "@trpc/server";
import {
	and,
	count,
	countDistinct,
	desc,
	eq,
	gt,
	inArray,
	isNotNull,
	not,
	or,
} from "drizzle-orm";
import { z } from "zod";
import { QUESTIONNAIRE_STATUSES } from "~/lib/constants";
import type { InsertingQuestionnaire } from "~/lib/models";
import { formatClientAge } from "~/lib/utils";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { clients, questionnaires } from "~/server/db/schema";

interface QuestionnaireDetails {
	name: string;
	site: string;
	ageRanges: {
		min: number;
		max: number;
	};
}

const QUESTIONNAIRES: QuestionnaireDetails[] = [
	{
		name: "DP-4",
		site: "WPS",
		ageRanges: {
			min: 0,
			max: 22,
		},
	},
	{
		name: "BASC Preschool",
		site: "QGlobal",
		ageRanges: { min: 0, max: 6 },
	},
	{ name: "BASC Child", site: "QGlobal", ageRanges: { min: 6, max: 12 } },
	{
		name: "BASC Adolescent",
		site: "QGlobal",
		ageRanges: { min: 12, max: 22 },
	},
	{
		name: "Conners EC",
		site: "MHS",
		ageRanges: { min: 0, max: 6 },
	},
	{
		name: "Conners 4",
		site: "MHS",
		ageRanges: { min: 6, max: 18 },
	},
	{
		name: "Conners 4 Self",
		site: "MHS",
		ageRanges: { min: 8, max: 18 },
	},
	{
		name: "ASRS (2-5 Years)",
		site: "MHS",
		ageRanges: { min: 2, max: 6 },
	},
	{
		name: "ASRS (6-18 Years)",
		site: "MHS",
		ageRanges: { min: 6, max: 19 },
	},
	{ name: "Vineland", site: "QGlobal", ageRanges: { min: 0, max: 80 } },
	{ name: "PAI", site: "Unknown", ageRanges: { min: 18, max: 99 } },
	{ name: "CAARS 2", site: "Unknown", ageRanges: { min: 18, max: 80 } },
	{ name: "SRS-2", site: "Unknown", ageRanges: { min: 19, max: 99 } },
	{ name: "SRS Self", site: "Unknown", ageRanges: { min: 19, max: 99 } },
	{ name: "ABAS 3", site: "Unknown", ageRanges: { min: 16, max: 89 } },
	{ name: "CAT-Q", site: "NovoPsych", ageRanges: { min: 16, max: 99 } },
];

function parseQuestionnairesFromText(text: string) {
	const lines = text.split("\n").filter((line) => line.trim() !== "");
	const items: { link: string; questionnaireType: string }[] = [];

	for (const line of lines) {
		// Regex to match: optional number with parenthesis, URL, dash, type
		const match = line.match(/(?:\d+\)\s+)?([^\s]+)\s+-\s+(.+)/);

		if (match) {
			const [, link, questionnaireType] = match;
			if (link !== undefined && questionnaireType !== undefined) {
				items.push({
					link: link.trim(),
					questionnaireType: questionnaireType.trim(),
				});
			}
		}
	}

	return items;
}

export const questionnaireRouter = createTRPCRouter({
	getQuestionnaireList: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const foundClient = await ctx.db.query.clients.findFirst({
				where: eq(clients.id, input.clientId),
			});

			if (!foundClient) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Client not found",
				});
			}

			const age = Number(formatClientAge(foundClient.dob, "years"));

			return QUESTIONNAIRES.filter(
				(q) => q.ageRanges.min <= age && q.ageRanges.max >= age,
			);
		}),

	getSentQuestionnaires: protectedProcedure
		.input(z.number())
		.query(async ({ ctx, input }) => {
			const clientWithQuestionnaires = await ctx.db.query.clients.findFirst({
				where: eq(clients.id, input),
				with: {
					questionnaires: {
						orderBy: desc(questionnaires.sent),
					},
				},
			});

			if (!clientWithQuestionnaires) {
				return null;
			}

			return clientWithQuestionnaires.questionnaires ?? null;
		}),

	addQuestionnaire: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				questionnaireType: z
					.string()
					.min(1, { message: "Questionnaire type is required" }),
				link: z.url({ message: "Link must be a valid URL" }).optional(),
				sent: z.date().optional(),
				status: z.enum(QUESTIONNAIRE_STATUSES).default("PENDING"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (input.status === "EXTERNAL") {
				assertPermission(
					ctx.session.user,
					"clients:questionnaires:createexternal",
				);
			} else {
				assertPermission(ctx.session.user, "clients:questionnaires:create");
			}

			ctx.logger.info(input, "Creating questionnaire");

			const client = await ctx.db.query.clients.findFirst({
				where: eq(clients.id, input.clientId),
			});

			if (!client) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Client with id ${input.clientId} not found`,
				});
			}

			const sentDate = input.sent ? new Date(input.sent.toUTCString()) : null;

			if (input.link !== undefined) {
				const linkSearch = await ctx.db.query.questionnaires.findFirst({
					where: eq(questionnaires.link, input.link),
				});

				if (linkSearch) {
					// If link exists for DIFFERENT client -> CONFLICT
					if (linkSearch.clientId !== input.clientId) {
						const existingClient = await ctx.db.query.clients.findFirst({
							where: eq(clients.id, linkSearch.clientId),
						});
						throw new TRPCError({
							code: "CONFLICT",
							message: `Questionnaire with link ${input.link} already exists for ${existingClient?.fullName}`,
						});
					}

					if (linkSearch.clientId === input.clientId) {
						if (linkSearch.status === "ARCHIVED") {
							await ctx.db
								.update(questionnaires)
								.set({
									questionnaireType: input.questionnaireType,
									sent: sentDate,
									status: input.status,
									reminded: 0,
									lastReminded: null,
								})
								.where(eq(questionnaires.id, linkSearch.id));
							return await ctx.db.query.questionnaires.findFirst({
								where: eq(questionnaires.id, linkSearch.id),
							});
						} else {
							throw new TRPCError({
								code: "CONFLICT",
								message: `Questionnaire with link ${input.link} already exists for this client.`,
							});
						}
					}
				}
			}

			const result = await ctx.db.insert(questionnaires).values({
				clientId: input.clientId,
				questionnaireType: input.questionnaireType,
				link: input.link,
				sent: sentDate,
				status: input.status,
				reminded: 0,
				lastReminded: null,
			});

			const newId = result[0].insertId;

			const newQuestionnaire = await ctx.db.query.questionnaires.findFirst({
				where: eq(questionnaires.id, newId),
			});

			return newQuestionnaire;
		}),

	addBulkQuestionnaires: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				text: z.string().min(1, { message: "Text input is required" }),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:questionnaires:createbulk");

			ctx.logger.info(input, "Creating bulk questionnaires");

			const client = await ctx.db.query.clients.findFirst({
				where: eq(clients.id, input.clientId),
			});
			if (!client) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Client with id ${input.clientId} not found`,
				});
			}

			const parsedQuestionnaires = parseQuestionnairesFromText(input.text);

			if (parsedQuestionnaires.length === 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No valid questionnaires found in the provided text",
				});
			}

			const questionnairesToInsert: InsertingQuestionnaire[] = [];

			const existingQuestionnaires = await ctx.db.query.questionnaires.findMany(
				{
					where: and(
						eq(questionnaires.clientId, input.clientId),
						or(
							eq(questionnaires.status, "JUST_ADDED"),
							eq(questionnaires.status, "ARCHIVED"),
						),
					),
					columns: { id: true, link: true, questionnaireType: true },
				},
			);

			for (const newQuestionnaire of parsedQuestionnaires) {
				const existingQuestionnaire = existingQuestionnaires.find(
					(q) => q.link === newQuestionnaire.link,
				);

				if (existingQuestionnaire) {
					await ctx.db
						.update(questionnaires)
						.set({
							questionnaireType: newQuestionnaire.questionnaireType,
							status: "PENDING",
							sent: new Date(),
							reminded: 0,
							lastReminded: null,
						})
						.where(eq(questionnaires.id, existingQuestionnaire.id));
				} else {
					questionnairesToInsert.push({
						clientId: input.clientId,
						questionnaireType: newQuestionnaire.questionnaireType,
						link: newQuestionnaire.link,
						sent: new Date(),
						status: "PENDING" as "PENDING",
						reminded: 0,
						lastReminded: null,
					});
				}
			}

			if (questionnairesToInsert.length > 0) {
				try {
					await ctx.db.transaction(async (tx) => {
						await tx.insert(questionnaires).values(questionnairesToInsert);
					});
				} catch (error) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to insert new questionnaires",
						cause: error,
					});
				}
			}

			return {
				success: true,
			};
		}),

	updateQuestionnaire: protectedProcedure
		.input(
			z.object({
				id: z.number(),
				questionnaireType: z.string().min(1),
				link: z.url().optional(),
				sent: z.date().optional(),
				status: z.enum(QUESTIONNAIRE_STATUSES),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:questionnaires:create");

			ctx.logger.info(input, "Updating questionnaire");

			if (input.link !== undefined) {
				const linkSearch = await ctx.db.query.questionnaires.findFirst({
					where: and(
						eq(questionnaires.link, input.link),
						not(eq(questionnaires.id, input.id)),
					),
				});

				if (linkSearch) {
					const existingClient = await ctx.db.query.clients.findFirst({
						where: eq(clients.id, linkSearch.clientId),
					});
					throw new TRPCError({
						code: "CONFLICT",
						message: `Questionnaire with link ${input.link} already exists for ${existingClient?.fullName}`,
					});
				}
			}

			const sentDate = input.sent ? new Date(input.sent.toUTCString()) : null;

			await ctx.db
				.update(questionnaires)
				.set({
					questionnaireType: input.questionnaireType,
					link: input.link,
					sent: sentDate,
					status: input.status,
				})
				.where(eq(questionnaires.id, input.id));

			return { success: true };
		}),

	deleteQuestionnaire: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:questionnaires:create");

			ctx.logger.info(input, "Deleting questionnaire");

			await ctx.db
				.update(questionnaires)
				.set({ status: "ARCHIVED" })
				.where(eq(questionnaires.id, input.id));

			return { success: true };
		}),

	getDuplicateLinks: protectedProcedure.query(async ({ ctx }) => {
		// 1. Clients with the same link multiple times (grouped by link + clientId)
		const duplicatePerClient = await ctx.db
			.select({
				link: questionnaires.link,
				clientId: questionnaires.clientId,
				count: count().as("count"),
			})
			.from(questionnaires)
			.where(
				and(
					isNotNull(questionnaires.link),
					not(eq(questionnaires.status, "ARCHIVED")),
				),
			)
			.groupBy(questionnaires.link, questionnaires.clientId)
			.having(gt(count(), 1));

		// Get full client objects for duplicatePerClient
		const clientIdsForDuplicates = duplicatePerClient.map(
			(row) => row.clientId,
		);
		const clientsForDuplicates =
			clientIdsForDuplicates.length > 0
				? await ctx.db
						.select()
						.from(clients)
						.where(inArray(clients.id, clientIdsForDuplicates))
				: [];

		// 2. Links shared across multiple clients
		const sharedAcrossClients = await ctx.db
			.select({
				link: questionnaires.link,
			})
			.from(questionnaires)
			.where(
				and(
					isNotNull(questionnaires.link),
					not(eq(questionnaires.status, "ARCHIVED")),
				),
			)
			.groupBy(questionnaires.link)
			.having(gt(countDistinct(questionnaires.clientId), 1));

		// Get all clients for each shared link
		const sharedLinksWithClients = await Promise.all(
			sharedAcrossClients.map(async ({ link }) => {
				if (link === null) {
					return {
						link: null,
						clients: [],
					};
				}

				const clientsWithLink = await ctx.db
					.select({
						client: clients,
						count: count().as("count"),
					})
					.from(questionnaires)
					.innerJoin(clients, eq(questionnaires.clientId, clients.id))
					.where(
						and(
							eq(questionnaires.link, link),
							not(eq(questionnaires.status, "ARCHIVED")),
						),
					)
					.groupBy(clients.id);

				return {
					link,
					clients: clientsWithLink,
				};
			}),
		);

		return {
			duplicatePerClient: duplicatePerClient.map((row) => ({
				link: row.link,
				client: clientsForDuplicates.find((c) => c.id === row.clientId),
				count: row.count,
			})),
			sharedAcrossClients: sharedLinksWithClients,
		};
	}),
});

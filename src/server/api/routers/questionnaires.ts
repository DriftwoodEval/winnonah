import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import { TRPCError } from "@trpc/server";
import {
	and,
	asc,
	count,
	countDistinct,
	desc,
	eq,
	gt,
	inArray,
	isNotNull,
	not,
} from "drizzle-orm";
import { z } from "zod";
import { invalidateCache } from "~/lib/cache";
import { QUESTIONNAIRE_STATUSES } from "~/lib/constants";
import { updatePunchData } from "~/lib/google";
import type { InsertingQuestionnaire } from "~/lib/models";
import { CACHE_KEY_MISSING_APPOINTMENTS } from "~/server/api/routers/client";
import {
	assertPermission,
	type Context,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import {
	appointments,
	assessmentTypes,
	clients,
	failures,
	inPersonAssessmentHistory,
	inPersonAssessments,
	questionnaireRules,
	questionnaires,
} from "~/server/db/schema";
import { getQuestionnaireEligibilityAge } from "~/server/questionnaire-age";

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

function parseQuestionnairesFromBulkImport(text: string) {
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

const findLatestScreenshot = (
	qLink: string,
	screenshotDir: string,
): string | null => {
	try {
		const parsedUrl = new URL(qLink);

		const hostParts = parsedUrl.hostname.split(".");
		const domain =
			(hostParts.length > 1 ? hostParts[hostParts.length - 2] : hostParts[0]) ??
			"";

		const pathClean = parsedUrl.pathname
			.replace(/^\/+|\/+$/g, "")
			.replace(/[^\w-]+/g, "_");
		const queryClean = parsedUrl.search
			.replace(/^\?/, "")
			.replace(/[^\w-]+/g, "_");

		const urlIdentity =
			[pathClean, queryClean].filter(Boolean).join("_") || "unknown";

		if (!fs.existsSync(screenshotDir)) return null;

		const files = fs.readdirSync(screenshotDir);

		const matches = files
			.filter((file) => file.includes(domain) && file.includes(urlIdentity))
			.sort((a, b) => {
				const extractTS = (name: string) => {
					const parts = name.replace(".png", "").split("_");
					return parts.slice(-2).join("_");
				};

				// Sort descending (latest first)
				return extractTS(b).localeCompare(extractTS(a));
			});

		const latestFile = matches[0];
		return latestFile ? path.join(screenshotDir, latestFile) : null;
	} catch (_e) {
		return null;
	}
};

const questionnaireTypeInputSchema = z.object({
	name: z.string().min(1),
	site: z.string().min(1),
	minAge: z.number().int().min(0),
	maxAge: z.number().int().min(0),
	minutes: z.number().int().min(1).nullable().optional(),
	inPerson: z.boolean().optional().default(false),
});

const questionnaireRuleBaseSchema = z.object({
	daeval: z.enum(["DA", "EVAL", "DAEVAL"]),
	diagnosis: z.enum(["ASD", "ADHD"]).nullable(),
	minAge: z.number().int().min(0),
	maxAge: z.number().int().min(0),
	questionnaires: z.array(z.string().min(1)),
	inPersonAssessments: z.array(z.string().min(1)).optional().default([]),
});

const atLeastOneAssessment = (data: {
	questionnaires: string[];
	inPersonAssessments?: string[];
}) =>
	data.questionnaires.length > 0 || (data.inPersonAssessments?.length ?? 0) > 0;

const questionnaireRuleInputSchema = questionnaireRuleBaseSchema.refine(
	atLeastOneAssessment,
	{ message: "At least one assessment is required" },
);

async function checkAndUpdateQsBatteryStatus(ctx: Context, clientId: number) {
	const session = ctx.session;
	if (!session) return;
	if (!session.user?.accessToken || !session.user?.refreshToken) return;

	const client = await ctx.db.query.clients.findFirst({
		where: eq(clients.id, clientId),
	});
	if (!client) return;

	const ageInYears = await getQuestionnaireEligibilityAge(
		ctx.db,
		clientId,
		client.dob,
	);

	const allRules = await ctx.db.query.questionnaireRules.findMany({
		orderBy: [
			asc(questionnaireRules.daeval),
			asc(questionnaireRules.diagnosis),
			asc(questionnaireRules.minAge),
		],
	});

	const ageFiltered = allRules.filter(
		(r) => r.minAge <= ageInYears && r.maxAge >= ageInYears,
	);

	const asdAdhd = client.asdAdhd;
	const wantedDiagnoses = new Set<string | null>();
	if (!asdAdhd) {
		wantedDiagnoses.add("ASD");
		wantedDiagnoses.add("ADHD");
	} else {
		if (asdAdhd.includes("ASD")) wantedDiagnoses.add("ASD");
		if (asdAdhd.includes("ADHD")) wantedDiagnoses.add("ADHD");
	}

	const applicableRules = ageFiltered.filter((r) => {
		if (r.daeval === "DAEVAL") return r.diagnosis === null;
		return wantedDiagnoses.has(r.diagnosis);
	});

	const daQTypes = new Set<string>();
	const evalQTypes = new Set<string>();
	for (const rule of applicableRules) {
		const qs = rule.questionnaires ?? [];
		if (rule.daeval === "DA" || rule.daeval === "DAEVAL") {
			for (const q of qs) daQTypes.add(q);
		}
		if (rule.daeval === "EVAL" || rule.daeval === "DAEVAL") {
			for (const q of qs) evalQTypes.add(q);
		}
	}

	if (daQTypes.size === 0 && evalQTypes.size === 0) return;

	const clientQs = await ctx.db.query.questionnaires.findMany({
		where: eq(questionnaires.clientId, clientId),
	});

	const doneStatuses = new Set(["COMPLETED", "EXTERNAL"]);

	const isDaBatteryComplete =
		daQTypes.size > 0 &&
		[...daQTypes].every((type) =>
			clientQs.some(
				(q) =>
					q.questionnaireType === type &&
					q.status !== "ARCHIVED" &&
					doneStatuses.has(q.status ?? ""),
			),
		);

	const isEvalBatteryComplete =
		evalQTypes.size > 0 &&
		[...evalQTypes].every((type) =>
			clientQs.some(
				(q) =>
					q.questionnaireType === type &&
					q.status !== "ARCHIVED" &&
					doneStatuses.has(q.status ?? ""),
			),
		);

	const updates: { daDone?: boolean; evalDone?: boolean } = {};
	if (daQTypes.size > 0) updates.daDone = isDaBatteryComplete;
	if (evalQTypes.size > 0) updates.evalDone = isEvalBatteryComplete;

	try {
		await updatePunchData(session, clientId.toString(), updates);
		await invalidateCache(
			ctx,
			"google:sheets:punchlist",
			"google:sheets:missing-punchlist",
		);
	} catch (e) {
		ctx.logger.error(
			e,
			"Failed to update punchlist Qs Done columns after questionnaire status change",
		);
	}
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

			const age = await getQuestionnaireEligibilityAge(
				ctx.db,
				input.clientId,
				foundClient.dob,
			);

			const types = await ctx.db.query.assessmentTypes.findMany({
				orderBy: [asc(assessmentTypes.name)],
				where: eq(assessmentTypes.inPerson, false),
			});

			if (types.length === 0) {
				return QUESTIONNAIRES.filter(
					(q) => q.ageRanges.min <= age && q.ageRanges.max >= age,
				);
			}

			return types.filter((t) => t.minAge <= age && t.maxAge >= age);
		}),

	getAllTypes: protectedProcedure.query(async ({ ctx }) => {
		return ctx.db.query.assessmentTypes.findMany({
			orderBy: [asc(assessmentTypes.name)],
		});
	}),

	createType: protectedProcedure
		.input(questionnaireTypeInputSchema)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:questionnaireRules");
			ctx.logger.info(input, "Creating questionnaire type");
			return ctx.db.insert(assessmentTypes).values(input);
		}),

	updateType: protectedProcedure
		.input(z.object({ id: z.number() }).merge(questionnaireTypeInputSchema))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:questionnaireRules");
			ctx.logger.info(input, "Updating questionnaire type");
			const { id, ...data } = input;
			await ctx.db
				.update(assessmentTypes)
				.set(data)
				.where(eq(assessmentTypes.id, id));
		}),

	deleteType: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:questionnaireRules");
			ctx.logger.info(input, "Deleting questionnaire type");
			await ctx.db
				.delete(assessmentTypes)
				.where(eq(assessmentTypes.id, input.id));
		}),

	getAllRules: protectedProcedure.query(async ({ ctx }) => {
		return ctx.db.query.questionnaireRules.findMany({
			orderBy: [
				asc(questionnaireRules.daeval),
				asc(questionnaireRules.diagnosis),
				asc(questionnaireRules.minAge),
			],
		});
	}),

	getApplicableRules: protectedProcedure
		.input(z.object({ clientId: z.number() }))
		.query(async ({ ctx, input }) => {
			const client = await ctx.db.query.clients.findFirst({
				where: eq(clients.id, input.clientId),
			});

			if (!client) return null;

			const ageInYears = await getQuestionnaireEligibilityAge(
				ctx.db,
				input.clientId,
				client.dob,
			);

			const allRules = await ctx.db.query.questionnaireRules.findMany({
				orderBy: [
					asc(questionnaireRules.daeval),
					asc(questionnaireRules.diagnosis),
					asc(questionnaireRules.minAge),
				],
			});

			const ageFiltered = allRules.filter(
				(r) => r.minAge <= ageInYears && r.maxAge >= ageInYears,
			);

			const asdAdhd = client.asdAdhd;
			const wantedDiagnoses = new Set<string | null>();

			if (!asdAdhd) {
				// Diagnosis unknown — include all diagnosis-specific rules
				wantedDiagnoses.add("ASD");
				wantedDiagnoses.add("ADHD");
			} else {
				if (asdAdhd.includes("ASD")) wantedDiagnoses.add("ASD");
				if (asdAdhd.includes("ADHD")) wantedDiagnoses.add("ADHD");
			}

			const rules = ageFiltered.filter((r) => {
				// DAEVAL rules have no diagnosis; always include if age matches
				if (r.daeval === "DAEVAL") return r.diagnosis === null;
				return wantedDiagnoses.has(r.diagnosis);
			});

			return {
				ageInYears,
				asdAdhd: client.asdAdhd,
				rules,
			};
		}),

	createRule: protectedProcedure
		.input(questionnaireRuleInputSchema)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:questionnaireRules");
			ctx.logger.info(input, "Creating questionnaire rule");
			return ctx.db.insert(questionnaireRules).values(input);
		}),

	updateRule: protectedProcedure
		.input(
			z
				.object({ id: z.number() })
				.merge(questionnaireRuleBaseSchema)
				.refine(atLeastOneAssessment, {
					message: "At least one assessment is required",
				}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:questionnaireRules");
			ctx.logger.info(input, "Updating questionnaire rule");
			const { id, ...data } = input;
			await ctx.db
				.update(questionnaireRules)
				.set(data)
				.where(eq(questionnaireRules.id, id));
		}),

	deleteRule: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:questionnaireRules");
			ctx.logger.info(input, "Deleting questionnaire rule");
			await ctx.db
				.delete(questionnaireRules)
				.where(eq(questionnaireRules.id, input.id));
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
							await ctx.db
								.delete(failures)
								.where(
									and(
										eq(failures.clientId, input.clientId),
										eq(
											failures.reason,
											`Error assigning ${input.questionnaireType}`,
										),
									),
								);
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

			await ctx.db
				.delete(failures)
				.where(
					and(
						eq(failures.clientId, input.clientId),
						eq(failures.reason, `Error assigning ${input.questionnaireType}`),
					),
				);

			const newQuestionnaire = await ctx.db.query.questionnaires.findFirst({
				where: eq(questionnaires.id, newId),
			});

			await invalidateCache(ctx, CACHE_KEY_MISSING_APPOINTMENTS);

			if (input.status === "COMPLETED" || input.status === "EXTERNAL") {
				await checkAndUpdateQsBatteryStatus(ctx, input.clientId);
			}

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

			const parsedQuestionnaires = parseQuestionnairesFromBulkImport(
				input.text,
			);

			if (parsedQuestionnaires.length === 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No valid questionnaires found in the provided text",
				});
			}

			const questionnairesToInsert: InsertingQuestionnaire[] = [];
			const processedTypes = new Set<string>();

			for (const newQuestionnaire of parsedQuestionnaires) {
				const existingByLink = await ctx.db.query.questionnaires.findFirst({
					where: and(
						eq(questionnaires.clientId, input.clientId),
						eq(questionnaires.link, newQuestionnaire.link),
					),
				});

				if (existingByLink) {
					if (
						existingByLink.status === "ARCHIVED" ||
						existingByLink.status === "JUST_ADDED"
					) {
						await ctx.db
							.update(questionnaires)
							.set({
								questionnaireType: newQuestionnaire.questionnaireType,
								status: "PENDING",
								sent: new Date(),
								reminded: 0,
								lastReminded: null,
							})
							.where(eq(questionnaires.id, existingByLink.id));
						processedTypes.add(newQuestionnaire.questionnaireType);
					}
					// skip, link already exists in an active status
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
					processedTypes.add(newQuestionnaire.questionnaireType);
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

			for (const qType of processedTypes) {
				await ctx.db
					.delete(failures)
					.where(
						and(
							eq(failures.clientId, input.clientId),
							eq(failures.reason, `Error assigning ${qType}`),
						),
					);
			}

			await invalidateCache(ctx, CACHE_KEY_MISSING_APPOINTMENTS);
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

			const existing = await ctx.db.query.questionnaires.findFirst({
				where: eq(questionnaires.id, input.id),
			});

			await ctx.db
				.update(questionnaires)
				.set({
					questionnaireType: input.questionnaireType,
					link: input.link,
					sent: sentDate,
					status: input.status,
				})
				.where(eq(questionnaires.id, input.id));

			if (existing && input.status !== "ARCHIVED") {
				await ctx.db
					.delete(failures)
					.where(
						and(
							eq(failures.clientId, existing.clientId),
							eq(failures.reason, `Error assigning ${input.questionnaireType}`),
						),
					);
			}

			if (existing?.clientId !== undefined) {
				await checkAndUpdateQsBatteryStatus(ctx, existing.clientId);
			}

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

	bulkUpdateStatus: protectedProcedure
		.input(
			z.object({
				ids: z.array(z.number()).min(1),
				status: z.enum(QUESTIONNAIRE_STATUSES),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:questionnaires:create");

			ctx.logger.info(input, "Bulk updating questionnaire status");

			await ctx.db
				.update(questionnaires)
				.set({ status: input.status })
				.where(inArray(questionnaires.id, input.ids));

			const affectedQs = await ctx.db.query.questionnaires.findMany({
				where: inArray(questionnaires.id, input.ids),
				columns: { clientId: true },
			});
			const uniqueClientIds = [...new Set(affectedQs.map((q) => q.clientId))];
			for (const clientId of uniqueClientIds) {
				await checkAndUpdateQsBatteryStatus(ctx, clientId);
			}

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

	getJustAdded: protectedProcedure.query(async ({ ctx }) => {
		const clientsWithJustAdded = await ctx.db
			.selectDistinct({
				client: clients,
			})
			.from(questionnaires)
			.innerJoin(clients, eq(questionnaires.clientId, clients.id))
			.where(eq(questionnaires.status, "JUST_ADDED"));

		return clientsWithJustAdded.map((row) => row.client);
	}),

	getLatestScreenshot: protectedProcedure
		.input(z.object({ link: z.url() }))
		.query(async ({ input }) => {
			const screenshotDir = path.join(process.cwd(), "q-screenshots");
			const latestPath = findLatestScreenshot(input.link, screenshotDir);

			if (!latestPath) return { url: null, viaMhsPortal: false };

			const filename = path.basename(latestPath);
			const viaMhsPortal = filename.startsWith("COMPLETED_MHS_PORTAL_");

			return { url: `/api/screenshots/${filename}`, viaMhsPortal };
		}),

	getInPersonAssessments: protectedProcedure
		.input(z.number())
		.query(async ({ ctx, input }) => {
			return ctx.db
				.select({
					id: inPersonAssessments.id,
					clientId: inPersonAssessments.clientId,
					assessmentType: inPersonAssessments.assessmentType,
					status: inPersonAssessments.status,
					addedDate: inPersonAssessments.addedDate,
					appointmentId: inPersonAssessments.appointmentId,
					updatedAt: inPersonAssessments.updatedAt,
					appointmentStartTime: appointments.startTime,
					appointmentDaEval: appointments.daEval,
				})
				.from(inPersonAssessments)
				.leftJoin(
					appointments,
					eq(inPersonAssessments.appointmentId, appointments.id),
				)
				.where(eq(inPersonAssessments.clientId, input))
				.orderBy(asc(inPersonAssessments.assessmentType));
		}),

	getInPersonAssessmentHistory: protectedProcedure
		.input(z.number())
		.query(async ({ ctx, input }) => {
			return ctx.db
				.select({
					id: inPersonAssessmentHistory.id,
					assessmentType: inPersonAssessments.assessmentType,
					content: inPersonAssessmentHistory.content,
					createdAt: inPersonAssessmentHistory.createdAt,
				})
				.from(inPersonAssessmentHistory)
				.innerJoin(
					inPersonAssessments,
					eq(inPersonAssessmentHistory.assessmentId, inPersonAssessments.id),
				)
				.where(eq(inPersonAssessments.clientId, input))
				.orderBy(desc(inPersonAssessmentHistory.createdAt));
		}),

	addInPersonAssessment: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				assessmentType: z.string().min(1),
				appointmentId: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:questionnaires:in-person");
			await ctx.db.insert(inPersonAssessments).ignore().values({
				clientId: input.clientId,
				assessmentType: input.assessmentType,
				addedDate: new Date(),
				appointmentId: input.appointmentId,
			});
			await invalidateCache(ctx, CACHE_KEY_MISSING_APPOINTMENTS);
		}),

	updateInPersonAssessmentStatus: protectedProcedure
		.input(
			z.object({
				id: z.number(),
				status: z.enum(["EXTERNAL"]).nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:questionnaires:in-person");
			await ctx.db
				.update(inPersonAssessments)
				.set({ status: input.status })
				.where(eq(inPersonAssessments.id, input.id));
		}),

	deleteInPersonAssessment: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:questionnaires:in-person");
			ctx.logger.info(
				{ ...input, deletedBy: ctx.session.user.email },
				"Deleting in-person assessment",
			);
			await ctx.db
				.delete(inPersonAssessments)
				.where(eq(inPersonAssessments.id, input.id));
		}),
});

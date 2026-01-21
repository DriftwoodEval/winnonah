import EventEmitter from "node:events";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "~/lib/logger";
import { hasPermission } from "~/lib/utils";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	clients,
	externalRecordHistory,
	externalRecords,
	users,
} from "~/server/db/schema";

const log = logger.child({ module: "ExternalRecordsApi" });

const externalRecordsEmitter = new EventEmitter();
externalRecordsEmitter.setMaxListeners(100);

// biome-ignore lint/suspicious/noExplicitAny: JSON
const areContentsEqual = (current: any, incoming: any): boolean => {
	if (current === undefined || incoming === undefined) {
		return false; // Treat undefined as a change if the other is defined
	}
	return JSON.stringify(current) === JSON.stringify(incoming);
};

// biome-ignore lint/suspicious/noExplicitAny: JSON
const extractTextFromTiptapJson = (tiptapJson: any): string => {
	if (
		!tiptapJson ||
		typeof tiptapJson !== "object" ||
		!Array.isArray(tiptapJson.content)
	) {
		return "";
	}

	let fullText = "";

	// biome-ignore lint/suspicious/noExplicitAny: JSON
	const traverse = (node: any) => {
		if (node.type === "text" && node.text) {
			fullText += node.text;
		}
		if (node.content && Array.isArray(node.content)) {
			node.content.forEach(traverse);
		}
	};

	tiptapJson.content.forEach(traverse);
	return fullText;
};

export const externalRecordRouter = createTRPCRouter({
	getExternalRecordByClientId: protectedProcedure
		.input(z.number())
		.query(async ({ ctx, input: clientId }) => {
			const data = await ctx.db.query.externalRecords.findFirst({
				where: eq(externalRecords.clientId, clientId),
			});

			if (!data) return null;

			return {
				clientId: data.clientId,
				contentJson: data.content,
				requested: data.requested,
				needsSecondRequest: data.needsSecondRequest,
				secondRequestDate: data.secondRequestDate,
			};
		}),

	setFirstRequestDate: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				requested: z.date().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (
				!hasPermission(
					ctx.session.user.permissions,
					"clients:records:requested",
				)
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}
			log.info(
				{ user: ctx.session.user.email },
				`Setting first request date for ${input.clientId}: ${input.requested}`,
			);

			const existingRecord = await ctx.db.query.externalRecords.findFirst({
				where: eq(externalRecords.clientId, input.clientId),
			});

			if (!existingRecord) {
				await ctx.db.insert(externalRecords).values({
					clientId: input.clientId,
					requested: input.requested,
				});
			} else {
				await ctx.db
					.update(externalRecords)
					.set({ requested: input.requested })
					.where(eq(externalRecords.clientId, input.clientId));
			}

			const updatedNote = await ctx.db.query.externalRecords.findFirst({
				where: eq(externalRecords.clientId, input.clientId),
			});

			if (updatedNote) {
				externalRecordsEmitter.emit("externalRecordsNoteUpdate", {
					clientId: updatedNote.clientId,
					requested: updatedNote.requested,
				});
			}
		}),

	setNeedsSecondRequest: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				needsSecondRequest: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (
				!hasPermission(ctx.session.user.permissions, "clients:records:needed")
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			log.info(
				{ user: ctx.session.user.email },
				`Setting needs second request for ${input.clientId}`,
			);

			await ctx.db
				.update(externalRecords)
				.set({ needsSecondRequest: input.needsSecondRequest })
				.where(eq(externalRecords.clientId, input.clientId));

			const updatedNote = await ctx.db.query.externalRecords.findFirst({
				where: eq(externalRecords.clientId, input.clientId),
			});

			if (updatedNote) {
				externalRecordsEmitter.emit("externalRecordsNoteUpdate", {
					clientId: updatedNote.clientId,
					needsSecondRequest: updatedNote.needsSecondRequest,
				});
			}
		}),

	setSecondRequestDate: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				secondRequestDate: z.date().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (
				!hasPermission(
					ctx.session.user.permissions,
					"clients:records:requested",
				)
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			log.info(
				{ user: ctx.session.user.email },
				`Setting second request date for ${input.clientId}: ${input.secondRequestDate}`,
			);

			const updatePayload = {
				secondRequestDate: input.secondRequestDate,
			};

			await ctx.db
				.update(externalRecords)
				.set(updatePayload)
				.where(eq(externalRecords.clientId, input.clientId));

			const updatedNote = await ctx.db.query.externalRecords.findFirst({
				where: eq(externalRecords.clientId, input.clientId),
			});

			if (updatedNote) {
				externalRecordsEmitter.emit("externalRecordsNoteUpdate", {
					clientId: updatedNote.clientId,
					secondRequestDate: updatedNote.secondRequestDate,
				});
			}
		}),

	onExternalRecordNoteUpdate: protectedProcedure
		.input(z.number()) // clientId
		.subscription(async function* ({ input: clientId }) {
			// Create a promise-based queue for events
			const eventQueue: Array<{
				clientId: number;
				// biome-ignore lint/suspicious/noExplicitAny: JSON
				contentJson: any;
				requested: Date | null;
				needsSecondRequest: boolean;
				secondRequestDate: Date | null;
			}> = [];
			let resolveNext: (() => void) | null = null;

			const onUpdate = (data: {
				clientId: number;
				// biome-ignore lint/suspicious/noExplicitAny: JSON
				contentJson: any;
				requested: Date | null;
				needsSecondRequest: boolean;
				secondRequestDate: Date | null;
			}) => {
				// Only queue events for this specific client
				if (data.clientId === clientId) {
					eventQueue.push(data);
					if (resolveNext) {
						resolveNext();
						resolveNext = null;
					}
				}
			};

			externalRecordsEmitter.on("externalRecordsNoteUpdate", onUpdate);

			try {
				while (true) {
					// Wait for an event if queue is empty
					if (eventQueue.length === 0) {
						await new Promise<void>((resolve) => {
							resolveNext = resolve;
						});
					}

					// Yield all queued events
					while (eventQueue.length > 0) {
						const event = eventQueue.shift();
						if (event) {
							yield event;
						}
					}
				}
			} finally {
				// Cleanup when subscription ends
				externalRecordsEmitter.off("externalRecordsNoteUpdate", onUpdate);
			}
		}),

	updateExternalRecordNote: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				contentJson: z.any().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				if (
					!hasPermission(
						ctx.session.user.permissions,
						"clients:records:reviewed",
					)
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
					});
				}

				log.info(
					{ user: ctx.session.user.email },
					"Updating external records note",
				);

				const HISTORY_MERGE_WINDOW = 5 * 60 * 1000; // 5 minutes

				await ctx.db.transaction(async (tx) => {
					const currentRecordNote = await tx.query.externalRecords.findFirst({
						where: eq(externalRecords.clientId, input.clientId),
					});

					if (!currentRecordNote) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Note not found",
						});
					}

					const newContent =
						input.contentJson !== undefined
							? input.contentJson
							: currentRecordNote.content;

					const contentChanged = !areContentsEqual(
						currentRecordNote.content,
						newContent,
					);

					if (contentChanged) {
						const timeSinceLastUpdate = currentRecordNote.updatedAt
							? Date.now() - new Date(currentRecordNote.updatedAt).getTime()
							: Number.POSITIVE_INFINITY;

						const isRecentEditBySameUser =
							currentRecordNote.updatedBy === ctx.session.user.email &&
							timeSinceLastUpdate < HISTORY_MERGE_WINDOW;

						if (!isRecentEditBySameUser && currentRecordNote.content !== null) {
							await tx.insert(externalRecordHistory).values({
								externalRecordId: currentRecordNote.clientId,
								content: currentRecordNote.content,
								updatedBy: currentRecordNote.updatedBy,
							});
						} else {
							log.info(
								{ user: ctx.session.user.email },
								"Skipping history log (squash edit)",
							);
						}
					} else {
						log.info(
							{ user: ctx.session.user.email },
							"No changes detected in note",
						);
						return;
					}

					await tx
						.update(externalRecords)
						.set({
							content: input.contentJson,
							updatedBy: ctx.session.user.email,
						})
						.where(eq(externalRecords.clientId, input.clientId));

					const textContent = extractTextFromTiptapJson(newContent);
					if (textContent.includes("autism is listed in the records")) {
						await tx
							.update(clients)
							.set({ autismStop: true })
							.where(eq(clients.id, input.clientId));
					}
				});

				const updatedNote = await ctx.db.query.externalRecords.findFirst({
					where: eq(externalRecords.clientId, input.clientId),
				});

				if (updatedNote) {
					externalRecordsEmitter.emit("externalRecordsNoteUpdate", {
						clientId: updatedNote.clientId,
						contentJson: updatedNote.content,
					});
				}

				return { success: true };
			} catch (error) {
				console.error("Update record error:", error);

				if (error instanceof TRPCError) {
					throw error;
				}

				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error ? error.message : "Failed to update record",
					cause: error,
				});
			}
		}),

	createRecordNote: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				contentJson: z.any().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (
				!hasPermission(ctx.session.user.permissions, "clients:records:reviewed")
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
				});
			}

			log.info(
				{ user: ctx.session.user.email },
				`Creating external records note for ${input.clientId}`,
			);

			const notePayload = {
				clientId: input.clientId,
				content: input.contentJson,
				updatedBy: ctx.session.user.email,
			};

			await ctx.db.insert(externalRecords).values(notePayload);

			const textContent = extractTextFromTiptapJson(input.contentJson);
			if (textContent.includes("autism is listed in the records")) {
				await ctx.db
					.update(clients)
					.set({ autismStop: true })
					.where(eq(clients.id, input.clientId));
			}

			const newRecordNote = await ctx.db.query.externalRecords.findFirst({
				where: eq(externalRecords.clientId, input.clientId),
			});

			if (!newRecordNote) {
				throw new Error("Failed to retrieve the newly created record.");
			}

			externalRecordsEmitter.emit("externalRecordsNoteUpdate", {
				clientId: newRecordNote.clientId,
				contentJson: newRecordNote.content,
				requested: newRecordNote.requested,
				needsSecondRequest: newRecordNote.needsSecondRequest,
				secondRequestDate: newRecordNote.secondRequestDate,
			});

			return newRecordNote;
		}),

	getHistory: protectedProcedure
		.input(z.object({ noteId: z.number() }))
		.query(async ({ ctx, input }) => {
			const history = await ctx.db
				.select({
					id: externalRecordHistory.id,
					content: externalRecordHistory.content,
					updatedBy: externalRecordHistory.updatedBy,
					createdAt: externalRecordHistory.createdAt,
					updatedByName: users.name,
					updatedByImage: users.image,
				})
				.from(externalRecordHistory)
				.leftJoin(users, eq(externalRecordHistory.updatedBy, users.email))
				.where(eq(externalRecordHistory.externalRecordId, input.noteId))
				.orderBy(desc(externalRecordHistory.createdAt));

			const current = await ctx.db
				.select({
					id: externalRecords.clientId,
					content: externalRecords.content,
					updatedBy: externalRecords.updatedBy,
					createdAt: externalRecords.updatedAt,
					updatedByName: users.name,
					updatedByImage: users.image,
				})
				.from(externalRecords)
				.leftJoin(users, eq(externalRecords.updatedBy, users.email))
				.where(eq(externalRecords.clientId, input.noteId))
				.limit(1);

			if (!current[0]) return [];

			const currentVersion = {
				...current[0],
				id: -1,
				isCurrent: true,
			};

			return [currentVersion, ...history];
		}),
});

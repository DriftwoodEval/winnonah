import { EventEmitter } from "node:events";
import type { JSONContent } from "@tiptap/core";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { noteHistory, notes, users } from "~/server/db/schema";

const noteEmitter = new EventEmitter();
noteEmitter.setMaxListeners(100);

const areContentsEqual = (
	current: JSONContent | null | undefined,
	incoming: JSONContent | null | undefined,
): boolean => {
	if (current === undefined || incoming === undefined) {
		return false; // Treat undefined as a change if the other is defined
	}
	return JSON.stringify(current) === JSON.stringify(incoming);
};

export const noteRouter = createTRPCRouter({
	getNoteByClientId: protectedProcedure
		.input(z.number())
		.query(async ({ ctx, input: clientId }) => {
			const data = await ctx.db.query.notes.findFirst({
				where: eq(notes.clientId, clientId),
			});

			if (!data) return null;

			return {
				clientId: data.clientId,
				contentJson: data.content as JSONContent | null,
				title: data.title,
			};
		}),

	onNoteUpdate: protectedProcedure
		.input(z.number()) // clientId
		.subscription(async function* ({ input: clientId }) {
			// Create a promise-based queue for events
			const eventQueue: Array<{
				clientId: number;
				contentJson: JSONContent | null;
				title: string | null;
			}> = [];
			let resolveNext: (() => void) | null = null;

			const onUpdate = (data: {
				clientId: number;
				contentJson: JSONContent | null;
				title: string | null;
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

			noteEmitter.on("noteUpdate", onUpdate);

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
				noteEmitter.off("noteUpdate", onUpdate);
			}
		}),

	updateNote: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				contentJson: z.custom<JSONContent>().optional(),
				title: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				assertPermission(ctx.session.user, "clients:notes");
				ctx.logger.info({ clientId: input.clientId }, "Updating note");

				const HISTORY_MERGE_WINDOW = 5 * 60 * 1000; // 5 minutes

				const changed = await ctx.db.transaction(async (tx) => {
					const currentNote = await tx.query.notes.findFirst({
						where: eq(notes.clientId, input.clientId),
					});

					if (!currentNote) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Note not found",
						});
					}

					const newContent =
						input.contentJson !== undefined
							? input.contentJson
							: (currentNote.content as JSONContent | null);
					const newTitle =
						input.title !== undefined ? input.title : currentNote.title;

					const contentChanged = !areContentsEqual(
						currentNote.content as JSONContent | null,
						newContent,
					);
					const titleChanged = currentNote.title !== newTitle;

					if (contentChanged || titleChanged) {
						const timeSinceLastUpdate = currentNote.updatedAt
							? Date.now() - new Date(currentNote.updatedAt).getTime()
							: Number.POSITIVE_INFINITY;

						const isRecentEditBySameUser =
							currentNote.updatedBy === ctx.session.user.email &&
							timeSinceLastUpdate < HISTORY_MERGE_WINDOW;

						if (!isRecentEditBySameUser) {
							await tx.insert(noteHistory).values({
								noteId: currentNote.clientId,
								content: currentNote.content,
								title: currentNote.title,
								updatedBy: currentNote.updatedBy,
							});
						} else {
							ctx.logger.info(
								{ clientId: input.clientId },
								"Skipping history log (squash edit)",
							);
						}

						const updatePayload: {
							content?: JSONContent | null;
							title?: string;
							updatedBy?: string | null;
						} = { updatedBy: ctx.session.user.email };
						if (input.contentJson !== undefined) {
							updatePayload.content = input.contentJson;
						}
						if (input.title !== undefined) {
							updatePayload.title = input.title;
						}

						await tx
							.update(notes)
							.set(updatePayload)
							.where(eq(notes.clientId, input.clientId));

						return true;
					}

					ctx.logger.info(
						{ clientId: input.clientId },
						"No changes detected in note",
					);
					return false;
				});

				if (changed) {
					const updatedNote = await ctx.db.query.notes.findFirst({
						where: eq(notes.clientId, input.clientId),
					});

					if (updatedNote) {
						noteEmitter.emit("noteUpdate", {
							clientId: updatedNote.clientId,
							contentJson: updatedNote.content as JSONContent | null,
							title: updatedNote.title,
						});
					}
				}

				return { success: true };
			} catch (error) {
				console.error("Update note error:", error);

				if (error instanceof TRPCError) {
					throw error;
				}

				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error ? error.message : "Failed to update note",
					cause: error,
				});
			}
		}),

	createNote: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				contentJson: z.custom<JSONContent>().optional(),
				title: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:notes");

			ctx.logger.info({ clientId: input.clientId }, "Creating note");

			const notePayload = {
				clientId: input.clientId,
				content: input.contentJson,
				title: input.title,
				updatedBy: ctx.session.user.email,
			};

			await ctx.db.insert(notes).values(notePayload);

			const newNote = await ctx.db.query.notes.findFirst({
				where: eq(notes.clientId, input.clientId),
			});

			if (!newNote) {
				throw new Error("Failed to retrieve the newly created note.");
			}

			noteEmitter.emit("noteUpdate", {
				clientId: newNote.clientId,
				contentJson: newNote.content as JSONContent | null,
				title: newNote.title,
			});

			return newNote;
		}),

	getHistory: protectedProcedure
		.input(z.object({ noteId: z.number() }))
		.query(async ({ ctx, input }) => {
			const history = await ctx.db
				.select({
					id: noteHistory.id,
					content: noteHistory.content,
					title: noteHistory.title,
					updatedBy: noteHistory.updatedBy,
					createdAt: noteHistory.createdAt,
					updatedByName: users.name,
					updatedByImage: users.image,
				})
				.from(noteHistory)
				.leftJoin(users, eq(noteHistory.updatedBy, users.email))
				.where(eq(noteHistory.noteId, input.noteId))
				.orderBy(desc(noteHistory.createdAt));

			const current = await ctx.db
				.select({
					id: notes.clientId,
					content: notes.content,
					title: notes.title,
					updatedBy: notes.updatedBy,
					createdAt: notes.updatedAt,
					updatedByName: users.name,
					updatedByImage: users.image,
				})
				.from(notes)
				.leftJoin(users, eq(notes.updatedBy, users.email))
				.where(eq(notes.clientId, input.noteId))
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

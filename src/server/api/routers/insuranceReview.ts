import type { JSONContent } from "@tiptap/core";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import {
	buildReviewBlock,
	extractTextFromContent,
	findDefaultInsertAt,
	mergeNotesContent,
} from "~/lib/insurance-notes-merge";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import {
	clients,
	insuranceReview,
	insuranceReviewHistory,
	notes,
	users,
} from "~/server/db/schema";
import { saveNoteInternal } from "./notes";

const HISTORY_MERGE_WINDOW = 5 * 60 * 1000;

function areContentsEqual(
	a: JSONContent | null | undefined,
	b: JSONContent | null | undefined,
): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export const insuranceReviewRouter = createTRPCRouter({
	getByClientId: protectedProcedure
		.input(z.number())
		.query(async ({ ctx, input: clientId }) => {
			const review = await ctx.db.query.insuranceReview.findFirst({
				where: eq(insuranceReview.clientId, clientId),
			});
			return review ?? null;
		}),

	update: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				contentJson: z.any(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:insurance:review");

			ctx.logger.info(
				{ clientId: input.clientId, updatedBy: ctx.session.user.email },
				"Updating insurance review",
			);

			await ctx.db.transaction(async (tx) => {
				const current = await tx.query.insuranceReview.findFirst({
					where: eq(insuranceReview.clientId, input.clientId),
				});

				if (!current) {
					await tx.insert(insuranceReview).values({
						clientId: input.clientId,
						content: input.contentJson,
						enabled: true,
						updatedBy: ctx.session.user.email,
					});
					return;
				}

				const contentChanged = !areContentsEqual(
					current.content as JSONContent | null,
					input.contentJson,
				);

				if (!contentChanged) return;

				const timeSince = current.updatedAt
					? Date.now() - new Date(current.updatedAt).getTime()
					: Number.POSITIVE_INFINITY;
				const isRecentSameUser =
					current.updatedBy === ctx.session.user.email &&
					timeSince < HISTORY_MERGE_WINDOW;

				if (!isRecentSameUser && current.content !== null) {
					await tx.insert(insuranceReviewHistory).values({
						reviewId: current.clientId,
						content: current.content,
						updatedBy: current.updatedBy,
					});
				}

				await tx
					.update(insuranceReview)
					.set({
						content: input.contentJson,
						updatedBy: ctx.session.user.email,
					})
					.where(eq(insuranceReview.clientId, input.clientId));
			});

			return { success: true };
		}),

	setEnabled: protectedProcedure
		.input(z.object({ clientId: z.number(), enabled: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:insurance:review");

			ctx.logger.info(
				{ ...input, updatedBy: ctx.session.user.email },
				"Setting insurance review enabled",
			);

			const current = await ctx.db.query.insuranceReview.findFirst({
				where: eq(insuranceReview.clientId, input.clientId),
			});

			if (current) {
				const updates: Partial<typeof insuranceReview.$inferInsert> = {
					enabled: input.enabled,
				};
				if (input.enabled && !current.claimedUserEmail) {
					updates.claimedUserEmail = ctx.session.user.email;
				}
				if (input.enabled) {
					updates.submittedToNotesAt = null;
				}
				await ctx.db
					.update(insuranceReview)
					.set(updates)
					.where(eq(insuranceReview.clientId, input.clientId));
			} else {
				await ctx.db.insert(insuranceReview).values({
					clientId: input.clientId,
					enabled: input.enabled,
					claimedUserEmail: input.enabled ? ctx.session.user.email : null,
					updatedBy: ctx.session.user.email,
				});
			}

			return { success: true };
		}),

	setPaused: protectedProcedure
		.input(z.object({ clientId: z.number(), paused: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:insurance:review");

			ctx.logger.info(
				{ ...input, updatedBy: ctx.session.user.email },
				"Setting insurance review paused",
			);

			await ctx.db
				.update(insuranceReview)
				.set({ paused: input.paused })
				.where(eq(insuranceReview.clientId, input.clientId));

			return { success: true };
		}),

	setClaim: protectedProcedure
		.input(z.object({ clientId: z.number(), userEmail: z.string().email() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:insurance:review");

			ctx.logger.info(
				{ ...input, claimedBy: ctx.session.user.email },
				"Setting insurance review claim",
			);

			await ctx.db
				.update(insuranceReview)
				.set({ claimedUserEmail: input.userEmail })
				.where(eq(insuranceReview.clientId, input.clientId));

			if (
				input.userEmail !== ctx.session.user.email &&
				env.NODE_ENV === "production"
			) {
				try {
					const client = await ctx.db.query.clients.findFirst({
						where: eq(clients.id, input.clientId),
						columns: { fullName: true, hash: true },
					});

					const clientUrl = client?.hash
						? `https://${env.NEXT_PUBLIC_APP_DOMAIN}/clients/${client.hash}?tab=insurance`
						: null;

					const cookieHeader = ctx.headers.get("cookie") ?? "";
					await fetch(`${env.PY_API}/notifications/insurance-review-claimed`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Cookie: cookieHeader,
						},
						body: JSON.stringify({
							user_email: input.userEmail,
							client_name: client?.fullName ?? "Unknown Client",
							claimer_name: ctx.session.user.name ?? ctx.session.user.email,
							client_url: clientUrl,
						}),
					});
				} catch (error) {
					ctx.logger.error(
						error,
						"Failed to send insurance review claim notification",
					);
				}
			}

			return { success: true };
		}),

	getHistory: protectedProcedure
		.input(z.object({ reviewId: z.number() }))
		.query(async ({ ctx, input }) => {
			const history = await ctx.db
				.select({
					id: insuranceReviewHistory.id,
					content: insuranceReviewHistory.content,
					updatedBy: insuranceReviewHistory.updatedBy,
					createdAt: insuranceReviewHistory.createdAt,
					updatedByName: users.name,
					updatedByImage: users.image,
				})
				.from(insuranceReviewHistory)
				.leftJoin(users, eq(insuranceReviewHistory.updatedBy, users.email))
				.where(eq(insuranceReviewHistory.reviewId, input.reviewId))
				.orderBy(desc(insuranceReviewHistory.createdAt));

			const current = await ctx.db
				.select({
					id: insuranceReview.clientId,
					content: insuranceReview.content,
					updatedBy: insuranceReview.updatedBy,
					createdAt: insuranceReview.updatedAt,
					updatedByName: users.name,
					updatedByImage: users.image,
				})
				.from(insuranceReview)
				.leftJoin(users, eq(insuranceReview.updatedBy, users.email))
				.where(eq(insuranceReview.clientId, input.reviewId))
				.limit(1);

			if (!current[0]) return [];

			const currentVersion = {
				...current[0],
				id: -1,
				isCurrent: true,
			};

			return [currentVersion, ...history];
		}),

	submitToNotes: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				insertAt: z.number().int().min(0).optional(),
			}),
		)
		.mutation(async ({ ctx, input: { clientId, insertAt } }) => {
			assertPermission(ctx.session.user, "clients:insurance:review");

			ctx.logger.info(
				{ clientId, insertAt, submittedBy: ctx.session.user.email },
				"Submitting insurance review to notes",
			);

			const review = await ctx.db.query.insuranceReview.findFirst({
				where: eq(insuranceReview.clientId, clientId),
			});

			if (review?.submittedToNotesAt) {
				return {
					success: false,
					reason: "Review has already been submitted to notes",
				};
			}

			if (!review?.content) {
				return { success: false, reason: "No review content to submit" };
			}

			const reviewContent = review.content as JSONContent;
			const reviewText = extractTextFromContent(reviewContent);
			if (!reviewText.trim()) {
				return { success: false, reason: "Review content is empty" };
			}

			const reviewBlock = buildReviewBlock(reviewContent, reviewText);

			const existingNote = await ctx.db.query.notes.findFirst({
				where: eq(notes.clientId, clientId),
			});

			const existingContent = (existingNote?.content as JSONContent | null) ?? {
				type: "doc",
				content: [],
			};

			const resolvedInsertAt =
				insertAt ?? findDefaultInsertAt(existingContent.content ?? []);

			const finalContent = mergeNotesContent(
				existingContent,
				reviewBlock,
				resolvedInsertAt,
			);

			await saveNoteInternal(ctx, { clientId, contentJson: finalContent });

			await ctx.db
				.update(insuranceReview)
				.set({ submittedToNotesAt: new Date(), enabled: false })
				.where(eq(insuranceReview.clientId, clientId));

			return { success: true };
		}),

	getAllEnabled: protectedProcedure.query(async ({ ctx }) => {
		assertPermission(ctx.session.user, "clients:insurance:review");

		return ctx.db
			.select({
				clientId: clients.id,
				clientName: clients.fullName,
				clientHash: clients.hash,
				claimedUserEmail: insuranceReview.claimedUserEmail,
				claimedUserName: users.name,
			})
			.from(insuranceReview)
			.innerJoin(clients, eq(insuranceReview.clientId, clients.id))
			.leftJoin(users, eq(insuranceReview.claimedUserEmail, users.email))
			.where(
				and(
					eq(insuranceReview.enabled, true),
					eq(insuranceReview.paused, false),
					isNull(insuranceReview.submittedToNotesAt),
				),
			)
			.orderBy(desc(insuranceReview.updatedAt), asc(clients.fullName));
	}),

	getMyClaimedClients: protectedProcedure.query(async ({ ctx }) => {
		if (!ctx.session.user.email) return [];

		return ctx.db
			.select({
				clientId: clients.id,
				clientName: clients.fullName,
				clientHash: clients.hash,
			})
			.from(insuranceReview)
			.innerJoin(clients, eq(insuranceReview.clientId, clients.id))
			.where(
				and(
					eq(insuranceReview.claimedUserEmail, ctx.session.user.email),
					eq(insuranceReview.enabled, true),
					eq(insuranceReview.paused, false),
					isNull(insuranceReview.submittedToNotesAt),
				),
			)
			.orderBy(desc(insuranceReview.updatedAt), asc(clients.fullName));
	}),
});

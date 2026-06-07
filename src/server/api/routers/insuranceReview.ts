import type { JSONContent } from "@tiptap/core";
import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import {
	clients,
	insuranceAliases,
	insuranceReview,
	insuranceReviewHistory,
	insurances,
	notes,
	users,
} from "~/server/db/schema";
import { saveNoteInternal } from "./notes";

const SCM_ALIAS = "SCM";
const ANDREW_EMAIL = "andrew@driftwoodeval.com";
const HISTORY_MERGE_WINDOW = 5 * 60 * 1000;

function areContentsEqual(
	a: JSONContent | null | undefined,
	b: JSONContent | null | undefined,
): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function extractTextFromContent(content: JSONContent): string {
	if (!content) return "";
	if (content.type === "text") return content.text ?? "";
	if (!content.content) return "";
	return content.content.map(extractTextFromContent).join("");
}

async function isClientSCM(
	db: Parameters<
		Parameters<typeof protectedProcedure.query>[0]
	>[0]["ctx"]["db"],
	primaryInsurance: string | null | undefined,
): Promise<boolean> {
	if (!primaryInsurance) return false;

	const match = await db
		.select({ id: insurances.id, shortName: insurances.shortName })
		.from(insurances)
		.leftJoin(insuranceAliases, eq(insuranceAliases.insuranceId, insurances.id))
		.where(
			or(
				eq(insurances.shortName, primaryInsurance),
				eq(insuranceAliases.name, primaryInsurance),
			),
		)
		.limit(1);

	const matched = match[0];
	if (!matched) return false;

	if (matched.shortName === SCM_ALIAS) return true;

	const scmAlias = await db.query.insuranceAliases.findFirst({
		where: (t, { and }) =>
			and(eq(t.insuranceId, matched.id), eq(t.name, SCM_ALIAS)),
	});

	return !!scmAlias;
}

export const insuranceReviewRouter = createTRPCRouter({
	getByClientId: protectedProcedure
		.input(z.number())
		.query(async ({ ctx, input: clientId }) => {
			const existing = await ctx.db.query.insuranceReview.findFirst({
				where: eq(insuranceReview.clientId, clientId),
			});

			if (existing) return existing;

			const client = await ctx.db.query.clients.findFirst({
				where: eq(clients.id, clientId),
				columns: { primaryInsurance: true },
			});

			const isSCM = await isClientSCM(ctx.db, client?.primaryInsurance);

			await ctx.db.insert(insuranceReview).values({
				clientId,
				content: null,
				enabled: isSCM,
				claimedUserEmail: isSCM ? ANDREW_EMAIL : null,
				updatedBy: ctx.session.user.email,
			});

			return ctx.db.query.insuranceReview.findFirst({
				where: eq(insuranceReview.clientId, clientId),
			});
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

	setClaim: protectedProcedure
		.input(z.object({ clientId: z.number(), userEmail: z.string().email() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:insurance:review");

			await ctx.db
				.update(insuranceReview)
				.set({ claimedUserEmail: input.userEmail })
				.where(eq(insuranceReview.clientId, input.clientId));

			if (input.userEmail !== ctx.session.user.email) {
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
		.input(z.number())
		.mutation(async ({ ctx, input: clientId }) => {
			assertPermission(ctx.session.user, "clients:insurance:review");

			const review = await ctx.db.query.insuranceReview.findFirst({
				where: eq(insuranceReview.clientId, clientId),
			});

			if (!review?.content) {
				return { success: false, reason: "No review content to submit" };
			}

			const reviewContent = review.content as JSONContent;
			const reviewText = extractTextFromContent(reviewContent);
			if (!reviewText.trim()) {
				return { success: false, reason: "Review content is empty" };
			}

			const reviewBlock: JSONContent[] = [
				{ type: "paragraph" },
				{
					type: "paragraph",
					content: [
						{
							type: "text",
							text: "Insurance Review",
							marks: [{ type: "bold" }],
						},
					],
				},
				...(reviewContent.content ?? [
					{
						type: "paragraph",
						content: [{ type: "text", text: reviewText }],
					},
				]),
			];

			const existingNote = await ctx.db.query.notes.findFirst({
				where: eq(notes.clientId, clientId),
			});

			const existingContent = (existingNote?.content as JSONContent | null) ?? {
				type: "doc",
				content: [],
			};

			const finalContent: JSONContent = {
				type: "doc",
				content: [...(existingContent.content ?? []), ...reviewBlock],
			};

			await saveNoteInternal(ctx, { clientId, contentJson: finalContent });
			return { success: true };
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
				),
			)
			.orderBy(clients.fullName);
	}),
});

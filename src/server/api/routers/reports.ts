import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull, isNull, ne, type SQL } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { invalidateCache } from "~/lib/cache";
import { REPORT_QUEUE_FOLDER_ID } from "~/lib/constants";
import {
	CACHE_KEY_PUNCHLIST,
	syncPunchData,
	updatePunchReportFields,
} from "~/lib/google";
import type { PermissionsObject } from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import {
	type Context,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import { clients, evaluators, reports, users } from "~/server/db/schema";

type AuthedContext = Context & {
	session: NonNullable<Context["session"]>;
};

const BILLING_FIELDS = {
	billed: { at: "billedAt", by: "billedByEmail", punch: "billed" },
	firstReviewDone: {
		at: "firstReviewAt",
		by: "firstReviewByEmail",
		punch: "firstReviewDone",
	},
	secondReviewNeeded: {
		at: "secondReviewNeededAt",
		by: "secondReviewByEmail",
		punch: "secondReviewNeeded",
	},
	bridgesBilled: {
		at: "bridgesBilledAt",
		by: "bridgesBilledByEmail",
		punch: "bridgesBilled",
	},
} as const;

function canAccessReportsPage(
	perms: PermissionsObject,
	maxClaimed?: number | null,
) {
	return (
		maxClaimed !== 0 ||
		hasPermission(perms, "reports:approve") ||
		hasPermission(perms, "reports:billing")
	);
}

function assertReportsPage(user: {
	permissions: PermissionsObject;
	maxClaimedReports?: number | null;
}) {
	if (!canAccessReportsPage(user.permissions, user.maxClaimedReports)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You don't have access to Reports",
		});
	}
}

function assertBillingAccess(perms: PermissionsObject) {
	if (
		!hasPermission(perms, "reports:approve") &&
		!hasPermission(perms, "reports:billing")
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You don't have permission to manage report billing",
		});
	}
}

const RECONCILE_THROTTLE_MS = 15_000;
let lastReconcileAt = 0;

/**
 * Keep report rows in step with the two systems still feeding them during the
 * transition: the Drive report-writing queue folder (which reports are ready to
 * claim) and the punch list (billing/review columns, via the shared
 * `syncPunchData`). Runs on every Reports page load, throttled so a burst of
 * loads does not hammer Google. Periodic Python jobs are the backstop for when
 * nobody is looking.
 */
async function reconcileReports(ctx: AuthedContext) {
	const now = Date.now();
	if (now - lastReconcileAt < RECONCILE_THROTTLE_MS) return;
	lastReconcileAt = now;

	await Promise.allSettled([
		reconcileReportQueueState(ctx),
		syncPunchData(ctx),
	]);
}

// Promote "pending" -> "queued" once a pool report's client folder reaches the
// Drive report-writing queue, and demote it again if the folder leaves before
// anyone claims it.
async function reconcileReportQueueState(ctx: AuthedContext) {
	try {
		const cookie = ctx.headers.get("cookie") ?? "";
		const res = await fetch(`${env.PY_API}/folders/${REPORT_QUEUE_FOLDER_ID}`, {
			headers: { Cookie: cookie },
		});
		if (!res.ok) return;
		const data = (await res.json()) as {
			folders: { id: string; name: string }[];
		};

		const queuedClientIds = new Set<number>();
		for (const folder of data.folders) {
			const match = /\[([A-Za-z0-9-]+)\]/.exec(folder.name);
			const clientId = match?.[1] ? Number(match[1]) : Number.NaN;
			if (!Number.isNaN(clientId)) queuedClientIds.add(clientId);
		}

		const openPool = await ctx.db
			.select({
				id: reports.id,
				clientId: reports.clientId,
				status: reports.status,
				writerUserId: reports.writerUserId,
				claimedAt: reports.claimedAt,
			})
			.from(reports)
			.where(and(eq(reports.selfWritten, false), isNull(reports.archivedAt)));

		for (const report of openPool) {
			const inQueue = queuedClientIds.has(report.clientId);
			if (inQueue && report.status === "pending") {
				await ctx.db
					.update(reports)
					.set({ status: "queued", queueReadyAt: new Date() })
					.where(eq(reports.id, report.id));
			} else if (
				!inQueue &&
				report.status === "queued" &&
				!report.writerUserId &&
				!report.claimedAt
			) {
				// Folder was pulled back out before anyone claimed it.
				await ctx.db
					.update(reports)
					.set({ status: "pending", queueReadyAt: null })
					.where(eq(reports.id, report.id));
			}
		}
	} catch (error) {
		ctx.logger.error(error, "Failed to reconcile report queue state");
	}
}

export const reportsRouter = createTRPCRouter({
	list: protectedProcedure
		.input(
			z.object({
				tab: z.enum(["active", "archived"]).default("active"),
				kind: z.enum(["pool", "self", "all"]).default("all"),
			}),
		)
		.query(async ({ ctx, input }) => {
			assertReportsPage(ctx.session.user);
			await reconcileReports(ctx);
			const isApprover =
				hasPermission(ctx.session.user.permissions, "reports:approve") ||
				hasPermission(ctx.session.user.permissions, "reports:billing");

			// Non-approvers only ever see the active pool list.
			const tab = isApprover ? input.tab : "active";
			const kind = isApprover ? input.kind : "pool";

			const where: SQL[] = [
				tab === "active"
					? isNull(reports.archivedAt)
					: isNotNull(reports.archivedAt),
			];
			if (kind === "pool") where.push(eq(reports.selfWritten, false));
			if (kind === "self") where.push(eq(reports.selfWritten, true));
			// "pending" pool reports (folder not yet in the writing queue) are an
			// approver-only concern.
			if (!isApprover) where.push(ne(reports.status, "pending"));

			const rows = await ctx.db
				.select({
					id: reports.id,
					clientId: reports.clientId,
					clientFullName: clients.fullName,
					clientHash: clients.hash,
					asdAdhd: reports.asdAdhd,
					selfWritten: reports.selfWritten,
					billablePiecework: reports.billablePiecework,
					status: reports.status,
					writerUserId: reports.writerUserId,
					writerEmail: reports.writerEmail,
					writerName: users.name,
					evaluatorName: evaluators.providerName,
					folderId: reports.folderId,
					folderName: reports.folderName,
					claimedAt: reports.claimedAt,
					writerCompletedAt: reports.writerCompletedAt,
					approvedAt: reports.approvedAt,
					billed: reports.billed,
					firstReviewDone: reports.firstReviewDone,
					secondReviewNeeded: reports.secondReviewNeeded,
					bridgesBilled: reports.bridgesBilled,
					source: reports.source,
					archivedAt: reports.archivedAt,
					createdAt: reports.createdAt,
				})
				.from(reports)
				.innerJoin(clients, eq(reports.clientId, clients.id))
				.leftJoin(users, eq(reports.writerUserId, users.id))
				.leftJoin(evaluators, eq(reports.evaluatorNpi, evaluators.npi))
				.where(and(...where))
				.orderBy(desc(reports.createdAt));

			return rows.map((r) => ({
				...r,
				canEditBilling: isApprover,
				isMine: r.writerUserId === ctx.session.user.id,
			}));
		}),

	myReports: protectedProcedure.query(async ({ ctx }) => {
		assertReportsPage(ctx.session.user);
		await reconcileReports(ctx);
		return ctx.db
			.select({
				id: reports.id,
				clientFullName: clients.fullName,
				clientHash: clients.hash,
				status: reports.status,
				folderName: reports.folderName,
				claimedAt: reports.claimedAt,
				writerCompletedAt: reports.writerCompletedAt,
			})
			.from(reports)
			.innerJoin(clients, eq(reports.clientId, clients.id))
			.where(
				and(
					eq(reports.writerUserId, ctx.session.user.id),
					isNull(reports.archivedAt),
				),
			)
			.orderBy(desc(reports.createdAt));
	}),

	// The writer's only control: flip between "claimed" (still working) and
	// "submitted" (done). No intermediate "writing" step to click through.
	markWriterComplete: protectedProcedure
		.input(z.object({ id: z.number(), complete: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			const report = await requireEditableReport(ctx, input.id);
			await ctx.db
				.update(reports)
				.set(
					input.complete
						? {
								writerCompletedAt: new Date(),
								writerCompletedByEmail: ctx.session.user.email,
								status: "submitted",
							}
						: {
								writerCompletedAt: null,
								writerCompletedByEmail: null,
								status: "claimed",
							},
				)
				.where(eq(reports.id, report.id));
			return { success: true };
		}),

	setBillingField: protectedProcedure
		.input(
			z.object({
				id: z.number(),
				field: z.enum([
					"billed",
					"firstReviewDone",
					"secondReviewNeeded",
					"bridgesBilled",
				]),
				value: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertBillingAccess(ctx.session.user.permissions);

			const report = await ctx.db.query.reports.findFirst({
				where: eq(reports.id, input.id),
				columns: { id: true, clientId: true },
			});
			if (!report) throw new TRPCError({ code: "NOT_FOUND" });

			const meta = BILLING_FIELDS[input.field];
			const updateSet: Partial<typeof reports.$inferInsert> = {
				[input.field]: input.value,
				[meta.at]: input.value ? new Date() : null,
				[meta.by]: input.value ? ctx.session.user.email : null,
			};
			await ctx.db
				.update(reports)
				.set(updateSet)
				.where(eq(reports.id, input.id));

			ctx.logger.info(
				{ ...input, updatedBy: ctx.session.user.email },
				"Updated report billing field",
			);

			// Dual-write out to the punch list during the transition. Best effort.
			try {
				await updatePunchReportFields(ctx.session, String(report.clientId), {
					[meta.punch]: input.value,
				});
			} catch (error) {
				ctx.logger.error(error, "Failed to mirror billing field to punch list");
			}
			// Drop the punch-list cache so syncPunchData reads the value we just
			// wrote out, not a stale copy that would revert this edit.
			await invalidateCache(ctx, CACHE_KEY_PUNCHLIST);

			return { success: true };
		}),

	approveAndRelease: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			assertBillingAccess(ctx.session.user.permissions);
			if (!hasPermission(ctx.session.user.permissions, "reports:approve")) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You don't have permission to reports:approve",
				});
			}

			const report = await ctx.db.query.reports.findFirst({
				where: eq(reports.id, input.id),
			});
			if (!report) throw new TRPCError({ code: "NOT_FOUND" });
			if (!["claimed", "submitted"].includes(report.status)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Cannot approve a report that is "${report.status}".`,
				});
			}

			await ctx.db
				.update(reports)
				.set({
					status: "approved",
					approvedAt: new Date(),
					approvedByEmail: ctx.session.user.email,
				})
				.where(eq(reports.id, input.id));

			// Free the writer's claim slot and notify, mirroring google.approveReport.
			if (report.writerUserId && report.folderId) {
				const writer = await ctx.db.query.users.findFirst({
					where: eq(users.id, report.writerUserId),
					columns: { email: true, claimedReportFolder: true },
				});
				const current = writer?.claimedReportFolder ?? [];
				const remaining = current.filter((f) => f.id !== report.folderId);
				await ctx.db
					.update(users)
					.set({ claimedReportFolder: remaining.length > 0 ? remaining : null })
					.where(eq(users.id, report.writerUserId));

				const cookieHeader = ctx.headers.get("cookie") ?? "";
				let queueCount = 0;
				try {
					const res = await fetch(
						`${env.PY_API}/folders/${REPORT_QUEUE_FOLDER_ID}`,
						{ headers: { Cookie: cookieHeader } },
					);
					if (res.ok) {
						const data = (await res.json()) as { folders: unknown[] };
						queueCount = data.folders.length;
					}
				} catch (error) {
					ctx.logger.error(
						error,
						"Failed to fetch queue count for notification",
					);
				}

				try {
					await fetch(`${env.PY_API}/notifications/report-approved`, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Cookie: cookieHeader,
						},
						body: JSON.stringify({
							user_email: writer?.email,
							report_name: report.folderName,
							queue_count: queueCount,
						}),
					});
				} catch (error) {
					ctx.logger.error(error, "Failed to send approval notification");
				}
			}

			return { success: true };
		}),

	archive: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			assertBillingAccess(ctx.session.user.permissions);
			if (!hasPermission(ctx.session.user.permissions, "reports:approve")) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			await ctx.db
				.update(reports)
				.set({ archivedAt: new Date() })
				.where(eq(reports.id, input.id));
			return { success: true };
		}),

	unarchive: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			assertBillingAccess(ctx.session.user.permissions);
			if (!hasPermission(ctx.session.user.permissions, "reports:approve")) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			await ctx.db
				.update(reports)
				.set({ archivedAt: null })
				.where(eq(reports.id, input.id));
			return { success: true };
		}),
});

/**
 * Load a report the caller is allowed to edit writing progress on: the report's
 * own writer, or an approver.
 */
async function requireEditableReport(ctx: AuthedContext, id: number) {
	assertReportsPage(ctx.session.user);
	const report = await ctx.db.query.reports.findFirst({
		where: eq(reports.id, id),
		columns: { id: true, writerUserId: true },
	});
	if (!report) throw new TRPCError({ code: "NOT_FOUND" });

	const isApprover =
		hasPermission(ctx.session.user.permissions, "reports:approve") ||
		hasPermission(ctx.session.user.permissions, "reports:billing");
	if (!isApprover && report.writerUserId !== ctx.session.user.id) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "You can only edit your own reports.",
		});
	}
	return report;
}

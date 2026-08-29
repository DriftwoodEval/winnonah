import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull, isNull, type SQL } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { invalidateCache } from "~/lib/cache";
import { CACHE_KEY_PUNCHLIST, updatePunchReportFields } from "~/lib/google";
import type { PermissionsObject } from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import { pythonConfigSchema } from "~/lib/validations/config";
import {
	type Context,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import {
	appointments,
	clients,
	evaluators,
	pythonConfig,
	reports,
	users,
} from "~/server/db/schema";

type AuthedContext = Context & {
	session: NonNullable<Context["session"]>;
};

const ADHD_ONLY_TYPES = new Set(["ADHD", "ADHD+LD"]);

const BILLING_FIELDS = {
	billed: { at: "billedAt", by: "billedByEmail", punch: "billed" },
	ajpReviewDone: {
		at: "ajpReviewAt",
		by: "ajpReviewByEmail",
		punch: "ajpReviewDone",
	},
	mcsReviewNeeded: {
		at: "mcsReviewNeededAt",
		by: "mcsReviewNeededByEmail",
		punch: "mcsReviewNeeded",
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

async function getAdhdPieceworkEvaluatorNpi(
	ctx: AuthedContext,
): Promise<number | null> {
	const record = await ctx.db.query.pythonConfig.findFirst({
		where: eq(pythonConfig.id, 1),
	});
	if (!record?.data) return null;
	const parsed = pythonConfigSchema.safeParse(record.data);
	if (!parsed.success) return null;
	const raw = parsed.data.config.piecework.adhd_piecework_evaluator_npi;
	const npi = Number(raw);
	return raw && !Number.isNaN(npi) ? npi : null;
}

/**
 * Build the creation snapshot for a manual report: the spawning eval
 * appointment's evaluator + type, whether that evaluator writes their own
 * reports, and whether piecework should pay this report.
 */
async function buildReportSnapshot(ctx: AuthedContext, clientId: number) {
	const recentEval = await ctx.db.query.appointments.findFirst({
		where: and(
			eq(appointments.clientId, clientId),
			eq(appointments.billingOnly, false),
			eq(appointments.cancelled, false),
			eq(appointments.rescheduled, false),
			eq(appointments.placeholder, false),
		),
		columns: { evaluatorNpi: true, asdAdhd: true, daEval: true },
		orderBy: desc(appointments.startTime),
	});

	const evaluatorNpi = recentEval?.evaluatorNpi ?? null;
	const asdAdhd = recentEval?.asdAdhd ?? null;

	let selfWritten = false;
	if (evaluatorNpi != null) {
		const evaluator = await ctx.db.query.evaluators.findFirst({
			where: eq(evaluators.npi, evaluatorNpi),
			columns: { writesOwnReports: true },
		});
		selfWritten = evaluator?.writesOwnReports ?? false;
	}

	const adhdNpi = await getAdhdPieceworkEvaluatorNpi(ctx);
	const billablePiecework =
		!asdAdhd ||
		!ADHD_ONLY_TYPES.has(asdAdhd) ||
		(adhdNpi != null && evaluatorNpi === adhdNpi);

	return { evaluatorNpi, asdAdhd, selfWritten, billablePiecework };
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
					ajpReviewDone: reports.ajpReviewDone,
					mcsReviewNeeded: reports.mcsReviewNeeded,
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

	setWritingStatus: protectedProcedure
		.input(
			z.object({
				id: z.number(),
				status: z.enum(["claimed", "writing", "submitted"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const report = await requireEditableReport(ctx, input.id);
			await ctx.db
				.update(reports)
				.set({ status: input.status })
				.where(eq(reports.id, report.id));
			return { success: true };
		}),

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
								status: "writing",
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
					"ajpReviewDone",
					"mcsReviewNeeded",
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

			// Dual-write to the punch list during the transition. Best effort.
			try {
				await updatePunchReportFields(ctx.session, String(report.clientId), {
					[meta.punch]: input.value,
				});
				await invalidateCache(ctx, CACHE_KEY_PUNCHLIST);
			} catch (error) {
				ctx.logger.error(error, "Failed to mirror billing field to punch list");
			}

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
						`${env.PY_API}/folders/1fGZavJU8bAqROKd8iTgoEtRT8orp4a4s`,
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

	addManualReport: protectedProcedure
		.input(
			z.object({ clientId: z.number(), writerUserId: z.string().optional() }),
		)
		.mutation(async ({ ctx, input }) => {
			assertReportsPage(ctx.session.user);

			const existing = await ctx.db.query.reports.findFirst({
				where: and(
					eq(reports.clientId, input.clientId),
					isNull(reports.archivedAt),
				),
				columns: { id: true },
			});
			if (existing) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "This client already has an open report.",
				});
			}

			const snapshot = await buildReportSnapshot(ctx, input.clientId);

			let writerEmail: string | null = null;
			if (input.writerUserId) {
				const writer = await ctx.db.query.users.findFirst({
					where: eq(users.id, input.writerUserId),
					columns: { email: true },
				});
				writerEmail = writer?.email ?? null;
			}

			await ctx.db.insert(reports).values({
				clientId: input.clientId,
				evaluatorNpi: snapshot.evaluatorNpi,
				asdAdhd: snapshot.asdAdhd,
				selfWritten: snapshot.selfWritten,
				billablePiecework: snapshot.billablePiecework,
				status: input.writerUserId ? "writing" : "queued",
				writerUserId: input.writerUserId ?? null,
				writerEmail,
				source: "manual",
				createdByEmail: ctx.session.user.email,
			});

			ctx.logger.info(
				{ ...input, createdBy: ctx.session.user.email },
				"Manually added report",
			);
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

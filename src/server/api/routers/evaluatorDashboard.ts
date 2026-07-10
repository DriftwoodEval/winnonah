import { EventEmitter } from "node:events";
import type { JSONContent } from "@tiptap/core";
import { TRPCError } from "@trpc/server";

function extractPlainText(content: JSONContent): string {
	if (!content?.content) return "";
	return content.content
		.map((node) => {
			if (node.type === "text") return node.text ?? "";
			if (node.content) return extractPlainText(node);
			return "";
		})
		.join("\n")
		.trim();
}

import { addWeeks } from "date-fns";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { z } from "zod";
import { hasPermission } from "~/lib/utils";
import {
	assertPermission,
	type Context,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import {
	appointmentNoteHistory,
	appointmentNotes,
	appointments,
	clients,
	evaluators,
	users,
	workSummaryConfig,
} from "~/server/db/schema";

const apptNoteEmitter = new EventEmitter();
apptNoteEmitter.setMaxListeners(100);

async function resolveViewMode(
	ctx: Context & { session: NonNullable<Context["session"]> },
): Promise<"admin" | "evaluator"> {
	if (hasPermission(ctx.session.user.permissions, "evaluator-dashboard:admin"))
		return "admin";

	const ev = await ctx.db.query.evaluators.findFirst({
		where: and(
			eq(evaluators.email, ctx.session.user.email ?? ""),
			eq(evaluators.evaluatorDashboard, true),
		),
		columns: { npi: true },
	});
	if (ev) return "evaluator";

	throw new TRPCError({ code: "UNAUTHORIZED" });
}

async function getDashboardConfig(ctx: { db: Context["db"] }) {
	const [config, evaluator] = await Promise.all([
		ctx.db.query.workSummaryConfig.findFirst(),
		ctx.db.query.evaluators.findFirst({
			where: eq(evaluators.evaluatorDashboard, true),
			columns: { providerName: true },
		}),
	]);
	const firstName = evaluator?.providerName?.split(" ")[0] ?? null;
	return {
		dueDateWeeks: config?.evaluatorDashboardDueDateWeeks ?? 4,
		showMarkComplete: config?.evaluatorDashboardShowMarkComplete ?? true,
		evaluatorFirstName: firstName,
	};
}

async function getDashboardEvaluatorEmail(ctx: {
	db: Context["db"];
}): Promise<string | null> {
	const ev = await ctx.db.query.evaluators.findFirst({
		where: eq(evaluators.evaluatorDashboard, true),
		columns: { email: true },
	});
	return ev?.email ?? null;
}

const areContentsEqual = (
	a: JSONContent | string | null | undefined,
	b: JSONContent | string | null | undefined,
) => JSON.stringify(a) === JSON.stringify(b);

async function saveAppointmentNoteInternal(
	ctx: {
		db: Context["db"];
		session: { user: { email?: string | null } };
		logger: Context["logger"];
	},
	input: { appointmentId: string; contentJson?: JSONContent | string | null },
) {
	const HISTORY_MERGE_WINDOW = 5 * 60 * 1000;

	const changed = await ctx.db.transaction(async (tx) => {
		const current = await tx.query.appointmentNotes.findFirst({
			where: eq(appointmentNotes.appointmentId, input.appointmentId),
		});

		if (!current) {
			await tx.insert(appointmentNotes).values({
				appointmentId: input.appointmentId,
				content: input.contentJson ?? null,
				updatedBy: ctx.session.user.email,
			});
			return true;
		}

		const newContent =
			input.contentJson !== undefined
				? input.contentJson
				: (current.content as JSONContent | null);

		if (areContentsEqual(current.content as JSONContent | null, newContent)) {
			return false;
		}

		const timeSinceLastUpdate = current.updatedAt
			? Date.now() - new Date(current.updatedAt).getTime()
			: Number.POSITIVE_INFINITY;

		const isRecentBySameUser =
			current.updatedBy === ctx.session.user.email &&
			timeSinceLastUpdate < HISTORY_MERGE_WINDOW;

		if (!isRecentBySameUser) {
			await tx.insert(appointmentNoteHistory).values({
				noteId: current.appointmentId,
				content: current.content as JSONContent,
				updatedBy: current.updatedBy,
			});
		} else {
			ctx.logger.info(
				{ appointmentId: input.appointmentId },
				"Skipping history log (squash edit)",
			);
		}

		await tx
			.update(appointmentNotes)
			.set({ content: newContent, updatedBy: ctx.session.user.email })
			.where(eq(appointmentNotes.appointmentId, input.appointmentId));

		return true;
	});

	if (changed) {
		const updated = await ctx.db.query.appointmentNotes.findFirst({
			where: eq(appointmentNotes.appointmentId, input.appointmentId),
		});
		if (updated) {
			apptNoteEmitter.emit("noteUpdate", {
				appointmentId: updated.appointmentId,
				contentJson: updated.content as JSONContent | null,
			});
		}
	}

	return { success: true };
}

export const evaluatorDashboardRouter = createTRPCRouter({
	getConfig: protectedProcedure.query(async ({ ctx }) => {
		await resolveViewMode(ctx);
		return getDashboardConfig(ctx);
	}),

	setConfig: protectedProcedure
		.input(
			z.object({
				dueDateWeeks: z.number().int().min(0).max(52),
				showMarkComplete: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:evaluators");
			ctx.logger.info(
				{ ...input, updatedBy: ctx.session.user.email },
				"Updating evaluator dashboard config",
			);
			await ctx.db
				.insert(workSummaryConfig)
				.values({
					id: 1,
					evaluatorDashboardDueDateWeeks: input.dueDateWeeks,
					evaluatorDashboardShowMarkComplete: input.showMarkComplete,
					appointmentDurationDefaults: {},
				})
				.onDuplicateKeyUpdate({
					set: {
						evaluatorDashboardDueDateWeeks: input.dueDateWeeks,
						evaluatorDashboardShowMarkComplete: input.showMarkComplete,
					},
				});
		}),

	getAppointments: protectedProcedure
		.input(
			z.object({
				tab: z.enum(["active", "archived"]).default("active"),
				preview: z.boolean().default(false),
			}),
		)
		.query(async ({ ctx, input }) => {
			const resolvedMode = await resolveViewMode(ctx);
			const viewMode =
				input.preview && resolvedMode === "admin" ? "evaluator" : resolvedMode;
			const config = await getDashboardConfig(ctx);

			const dashboardEvaluator = await ctx.db.query.evaluators.findFirst({
				where: eq(evaluators.evaluatorDashboard, true),
				columns: { npi: true },
			});

			if (!dashboardEvaluator) return [];

			const baseConditions = [
				eq(appointments.evaluatorNpi, dashboardEvaluator.npi),
				eq(appointments.cancelled, false),
				eq(appointments.rescheduled, false),
				eq(appointments.placeholder, false),
				eq(appointments.billingOnly, false),
			];

			if (viewMode === "evaluator") {
				baseConditions.push(isNull(appointments.evaluatorDashboardArchivedAt));
				baseConditions.push(isNull(appointments.reportCompletedAt));
			} else if (input.tab === "active") {
				baseConditions.push(isNull(appointments.evaluatorDashboardArchivedAt));
			} else {
				// admin archived tab: only archived rows
				baseConditions.push(
					isNotNull(appointments.evaluatorDashboardArchivedAt),
				);
			}

			const completedByEvaluator = alias(evaluators, "completed_by_evaluator");

			const rows = await ctx.db
				.select({
					id: appointments.id,
					startTime: appointments.startTime,
					daEval: appointments.daEval,
					asdAdhd: appointments.asdAdhd,
					clientFullName: clients.fullName,
					clientHash: clients.hash,
					lastTaskCompletedDate: appointments.lastTaskCompletedDate,
					dueDateOverride: appointments.dueDateOverride,
					showAnyway: appointments.evaluatorDashboardShowAnyway,
					reportCompletedAt: appointments.reportCompletedAt,
					reportCompletedByName: completedByEvaluator.providerName,
					evaluatorDashboardArchivedAt:
						appointments.evaluatorDashboardArchivedAt,
					noteContent: appointmentNotes.content,
				})
				.from(appointments)
				.innerJoin(clients, eq(appointments.clientId, clients.id))
				.leftJoin(
					appointmentNotes,
					eq(appointmentNotes.appointmentId, appointments.id),
				)
				.leftJoin(
					completedByEvaluator,
					eq(completedByEvaluator.email, appointments.reportCompletedByEmail),
				)
				.where(and(...baseConditions))
				.orderBy(appointments.startTime);

			const now = new Date();
			return rows
				.map((row) => {
					const base = row.lastTaskCompletedDate
						? new Date(row.lastTaskCompletedDate)
						: row.startTime;
					const calculated = addWeeks(base, config.dueDateWeeks);
					const effectiveDueDate = row.dueDateOverride
						? new Date(row.dueDateOverride)
						: calculated;

					const raw = row.noteContent;
					const noteContent =
						typeof raw === "string"
							? raw
							: raw && typeof raw === "object" && "content" in (raw as object)
								? extractPlainText(raw as JSONContent)
								: (raw as string | null);

					return {
						...row,
						noteContent,
						effectiveDueDate,
						isAdmin: viewMode === "admin",
					};
				})
				.filter(
					(row) =>
						viewMode === "admin" ||
						row.showAnyway ||
						row.effectiveDueDate > now,
				);
		}),

	saveNote: protectedProcedure
		.input(
			z.object({
				appointmentId: z.string(),
				contentJson: z.union([z.string(), z.custom<JSONContent>()]).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await resolveViewMode(ctx);
			return saveAppointmentNoteInternal(ctx, input);
		}),

	onNoteUpdate: protectedProcedure
		.input(z.string())
		.subscription(async function* ({ input: appointmentId, ctx, signal }) {
			await resolveViewMode(ctx);

			const eventQueue: Array<{
				appointmentId: string;
				contentJson: JSONContent | null;
			}> = [];
			let resolveNext: (() => void) | null = null;

			const onUpdate = (data: {
				appointmentId: string;
				contentJson: JSONContent | null;
			}) => {
				if (data.appointmentId === appointmentId) {
					eventQueue.push(data);
					if (resolveNext) {
						resolveNext();
						resolveNext = null;
					}
				}
			};

			apptNoteEmitter.on("noteUpdate", onUpdate);

			try {
				while (!signal?.aborted) {
					if (eventQueue.length === 0) {
						await new Promise<void>((resolve) => {
							resolveNext = resolve;
							signal?.addEventListener("abort", () => resolve(), {
								once: true,
							});
						});
					}
					while (eventQueue.length > 0) {
						const event = eventQueue.shift();
						if (event) yield event;
					}
				}
			} finally {
				apptNoteEmitter.off("noteUpdate", onUpdate);
			}
		}),

	getNoteHistory: protectedProcedure
		.input(z.object({ appointmentId: z.string() }))
		.query(async ({ ctx, input }) => {
			await resolveViewMode(ctx);

			const history = await ctx.db
				.select({
					id: appointmentNoteHistory.id,
					content: appointmentNoteHistory.content,
					updatedBy: appointmentNoteHistory.updatedBy,
					createdAt: appointmentNoteHistory.createdAt,
					updatedByName: users.name,
					updatedByImage: users.image,
				})
				.from(appointmentNoteHistory)
				.leftJoin(users, eq(appointmentNoteHistory.updatedBy, users.email))
				.where(eq(appointmentNoteHistory.noteId, input.appointmentId))
				.orderBy(desc(appointmentNoteHistory.createdAt));

			const current = await ctx.db
				.select({
					id: appointmentNotes.appointmentId,
					content: appointmentNotes.content,
					updatedBy: appointmentNotes.updatedBy,
					createdAt: appointmentNotes.updatedAt,
					updatedByName: users.name,
					updatedByImage: users.image,
				})
				.from(appointmentNotes)
				.leftJoin(users, eq(appointmentNotes.updatedBy, users.email))
				.where(eq(appointmentNotes.appointmentId, input.appointmentId))
				.limit(1);

			if (!current[0]) return history;

			return [{ ...current[0], isCurrent: true }, ...history];
		}),

	setLastTaskCompletedDate: protectedProcedure
		.input(
			z.object({
				appointmentId: z.string(),
				date: z.string().date().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "evaluator-dashboard:admin");
			ctx.logger.info(
				{ ...input, updatedBy: ctx.session.user.email },
				"Setting last task completed date",
			);
			await ctx.db
				.update(appointments)
				.set({ lastTaskCompletedDate: input.date as unknown as Date })
				.where(eq(appointments.id, input.appointmentId));
		}),

	setDueDateOverride: protectedProcedure
		.input(
			z.object({
				appointmentId: z.string(),
				date: z.string().date().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "evaluator-dashboard:admin");
			ctx.logger.info(
				{ ...input, updatedBy: ctx.session.user.email },
				"Setting due date override",
			);
			await ctx.db
				.update(appointments)
				.set({ dueDateOverride: input.date as unknown as Date })
				.where(eq(appointments.id, input.appointmentId));
		}),

	markReportComplete: protectedProcedure
		.input(z.object({ appointmentId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await resolveViewMode(ctx);
			const evaluatorEmail = await getDashboardEvaluatorEmail(ctx);
			ctx.logger.info(
				{ ...input, completedBy: evaluatorEmail },
				"Marking report complete",
			);
			await ctx.db
				.update(appointments)
				.set({
					reportCompletedAt: new Date(),
					reportCompletedByEmail: evaluatorEmail,
				})
				.where(eq(appointments.id, input.appointmentId));
		}),

	unmarkReportComplete: protectedProcedure
		.input(z.object({ appointmentId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "evaluator-dashboard:admin");
			ctx.logger.info(
				{ ...input, updatedBy: ctx.session.user.email },
				"Unmarking report complete",
			);
			await ctx.db
				.update(appointments)
				.set({ reportCompletedAt: null, reportCompletedByEmail: null })
				.where(eq(appointments.id, input.appointmentId));
		}),

	setShowAnyway: protectedProcedure
		.input(z.object({ appointmentId: z.string(), showAnyway: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "evaluator-dashboard:admin");
			ctx.logger.info(
				{ ...input, updatedBy: ctx.session.user.email },
				"Setting show anyway",
			);
			await ctx.db
				.update(appointments)
				.set({ evaluatorDashboardShowAnyway: input.showAnyway })
				.where(eq(appointments.id, input.appointmentId));
		}),

	archiveRow: protectedProcedure
		.input(z.object({ appointmentId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "evaluator-dashboard:admin");
			ctx.logger.info(
				{ ...input, archivedBy: ctx.session.user.email },
				"Archiving evaluator dashboard row",
			);
			await ctx.db
				.update(appointments)
				.set({ evaluatorDashboardArchivedAt: new Date() })
				.where(eq(appointments.id, input.appointmentId));
		}),

	unarchiveRow: protectedProcedure
		.input(z.object({ appointmentId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "evaluator-dashboard:admin");
			ctx.logger.info(
				{ ...input, unarchivedBy: ctx.session.user.email },
				"Unarchiving evaluator dashboard row",
			);
			await ctx.db
				.update(appointments)
				.set({ evaluatorDashboardArchivedAt: null })
				.where(eq(appointments.id, input.appointmentId));
		}),
});

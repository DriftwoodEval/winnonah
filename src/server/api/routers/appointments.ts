import { and, asc, count, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	appointmentReminderSettings,
	appointments,
	clients,
	evaluators,
	offices,
	reminderLogs,
	reminderTemplates,
	users,
} from "~/server/db/schema";

type QuietSettings =
	| { quietWindowStart: string; quietWindowEnd: string }
	| undefined;

function adjustForQuietWindow(
	date: Date,
	settings: QuietSettings,
): { scheduledFor: Date; quietAdjusted: boolean } {
	if (!settings) return { scheduledFor: date, quietAdjusted: false };

	const parseTimeOnDate = (timeStr: string, base: Date): Date => {
		const parts = timeStr.split(":").map(Number);
		const d = new Date(base);
		d.setHours(parts[0] ?? 0, parts[1] ?? 0, 0, 0);
		return d;
	};

	const windowStart = parseTimeOnDate(settings.quietWindowStart, date);
	const windowEnd = parseTimeOnDate(settings.quietWindowEnd, date);
	const isOvernight = windowStart > windowEnd;

	const inWindow = isOvernight
		? date >= windowStart || date <= windowEnd
		: date >= windowStart && date <= windowEnd;

	if (!inWindow) return { scheduledFor: date, quietAdjusted: false };

	// Push forward to the quiet window end
	if (isOvernight && date >= windowStart) {
		// e.g. scheduled at 11 PM, quiet ends at 8 AM → push to 8 AM next day
		const nextDay = new Date(date);
		nextDay.setDate(nextDay.getDate() + 1);
		return {
			scheduledFor: parseTimeOnDate(settings.quietWindowEnd, nextDay),
			quietAdjusted: true,
		};
	}
	// e.g. scheduled at 3 AM, quiet ends at 8 AM → push to 8 AM same day
	return { scheduledFor: windowEnd, quietAdjusted: true };
}

export const appointmentRouter = createTRPCRouter({
	getDayAhead: protectedProcedure
		.input(
			z
				.object({
					asUserId: z.string().optional(),
					asDate: z.string().optional(),
				})
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			let ref = new Date();
			if (process.env.NODE_ENV === "development" && input?.asDate) {
				const parsed = new Date(`${input.asDate}T00:00:00`);
				if (!Number.isNaN(parsed.getTime())) ref = parsed;
			}
			const startOfDay = new Date(
				Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0),
			);
			const endOfDay = new Date(
				Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59),
			);

			const viewAsId =
				process.env.NODE_ENV === "development" && input?.asUserId
					? input.asUserId
					: ctx.session.user.id;

			const userWithEvaluator = await ctx.db.query.users.findFirst({
				where: eq(users.id, viewAsId),
				with: { evaluator: true },
			});

			const myAppointments = userWithEvaluator?.evaluator
				? await ctx.db
						.select({
							id: appointments.id,
							startTime: appointments.startTime,
							endTime: appointments.endTime,
							locationKey: appointments.locationKey,
							daEval: appointments.daEval,
							asdAdhd: appointments.asdAdhd,
							calendarEventTitle: appointments.calendarEventTitle,
							confirmedAt: appointments.confirmedAt,
							clientName: clients.fullName,
							clientHash: clients.hash,
							clientDriveId: clients.driveId,
							clientTaHash: clients.taHash,
							officeName: offices.prettyName,
						})
						.from(appointments)
						.innerJoin(clients, eq(appointments.clientId, clients.id))
						.leftJoin(offices, eq(appointments.locationKey, offices.key))
						.where(
							and(
								eq(appointments.evaluatorNpi, userWithEvaluator.evaluator.npi),
								gte(appointments.startTime, startOfDay),
								lte(appointments.startTime, endOfDay),
								eq(appointments.cancelled, false),
								eq(appointments.rescheduled, false),
								eq(appointments.placeholder, false),
							),
						)
						.orderBy(asc(appointments.startTime))
				: [];

			const allRows = await ctx.db
				.select({
					evaluatorNpi: appointments.evaluatorNpi,
					evaluatorName: evaluators.providerName,
					locationKey: appointments.locationKey,
					officeName: offices.prettyName,
					appointmentId: appointments.id,
					startTime: appointments.startTime,
					endTime: appointments.endTime,
					daEval: appointments.daEval,
					asdAdhd: appointments.asdAdhd,
					confirmedAt: appointments.confirmedAt,
					clientName: clients.fullName,
					clientHash: clients.hash,
					clientDriveId: clients.driveId,
					clientTaHash: clients.taHash,
				})
				.from(appointments)
				.innerJoin(evaluators, eq(appointments.evaluatorNpi, evaluators.npi))
				.innerJoin(clients, eq(appointments.clientId, clients.id))
				.leftJoin(offices, eq(appointments.locationKey, offices.key))
				.where(
					and(
						gte(appointments.startTime, startOfDay),
						lte(appointments.startTime, endOfDay),
						eq(appointments.cancelled, false),
						eq(appointments.rescheduled, false),
						eq(appointments.placeholder, false),
					),
				)
				.orderBy(asc(appointments.startTime));

			type EvaluatorEntry = {
				name: string;
				npi: number;
				isCurrentUser: boolean;
				appointments: {
					id: string;
					startTime: Date;
					endTime: Date;
					daEval: string | null;
					asdAdhd: string | null;
					confirmedAt: Date | null;
					clientName: string;
					clientHash: string;
					clientDriveId: string | null;
					clientTaHash: string | null;
				}[];
			};
			type OfficeEntry = {
				officeName: string;
				locationKey: string;
				evaluators: Record<number, EvaluatorEntry>;
			};

			const byOffice: Record<string, OfficeEntry> = {};
			const currentNpi = userWithEvaluator?.evaluator?.npi;

			for (const row of allRows) {
				const key = row.locationKey ?? "unknown";
				const label = row.officeName ?? row.locationKey ?? "Unknown Office";
				const officeEntry: OfficeEntry = byOffice[key] ?? {
					officeName: label,
					locationKey: key,
					evaluators: {},
				};
				byOffice[key] = officeEntry;
				const evalEntry: EvaluatorEntry = officeEntry.evaluators[
					row.evaluatorNpi
				] ?? {
					name: row.evaluatorName,
					npi: row.evaluatorNpi,
					isCurrentUser: row.evaluatorNpi === currentNpi,
					appointments: [],
				};
				officeEntry.evaluators[row.evaluatorNpi] = evalEntry;
				evalEntry.appointments.push({
					id: row.appointmentId,
					startTime: row.startTime,
					endTime: row.endTime,
					daEval: row.daEval ?? null,
					asdAdhd: row.asdAdhd ?? null,
					confirmedAt: row.confirmedAt ?? null,
					clientName: row.clientName,
					clientHash: row.clientHash,
					clientDriveId: row.clientDriveId ?? null,
					clientTaHash: row.clientTaHash ?? null,
				});
			}

			const officeList = Object.values(byOffice).map((o) => ({
				...o,
				evaluators: Object.values(o.evaluators),
			}));

			return {
				myAppointments,
				hasEvaluatorAccount: !!userWithEvaluator?.evaluator,
				offices: officeList,
			};
		}),

	getByClientId: protectedProcedure
		.input(z.object({ clientId: z.number() }))
		.query(async ({ ctx, input }) => {
			return ctx.db
				.select({
					id: appointments.id,
					startTime: appointments.startTime,
					endTime: appointments.endTime,
					cpt: appointments.cpt,
					daEval: appointments.daEval,
					asdAdhd: appointments.asdAdhd,
					cancelled: appointments.cancelled,
					rescheduled: appointments.rescheduled,
					placeholder: appointments.placeholder,
					billingOnly: appointments.billingOnly,
					locationKey: appointments.locationKey,
					calendarEventTitle: appointments.calendarEventTitle,
					confirmedAt: appointments.confirmedAt,
					doNotRemind: appointments.doNotRemind,
					evaluatorName: evaluators.providerName,
					reminderCount: count(reminderLogs.id),
				})
				.from(appointments)
				.leftJoin(evaluators, eq(appointments.evaluatorNpi, evaluators.npi))
				.leftJoin(reminderLogs, eq(appointments.id, reminderLogs.appointmentId))
				.where(eq(appointments.clientId, input.clientId))
				.groupBy(
					appointments.id,
					appointments.startTime,
					appointments.endTime,
					appointments.cpt,
					appointments.daEval,
					appointments.asdAdhd,
					appointments.cancelled,
					appointments.rescheduled,
					appointments.placeholder,
					appointments.billingOnly,
					appointments.locationKey,
					appointments.calendarEventTitle,
					appointments.confirmedAt,
					appointments.doNotRemind,
					evaluators.providerName,
				)
				.orderBy(desc(appointments.startTime));
		}),

	updateStatus: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				confirmedAt: z.date().nullable().optional(),
				doNotRemind: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { id, confirmedAt, ...rest } = input;
			await ctx.db
				.update(appointments)
				.set({ confirmedAt, ...rest })
				.where(eq(appointments.id, id));

			if (confirmedAt !== undefined && confirmedAt !== null) {
				const cookieHeader = ctx.headers.get("cookie") ?? "";
				void fetch(`${env.PY_API}/appointments/${id}/confirm-calendar`, {
					method: "POST",
					headers: { Cookie: cookieHeader },
				}).catch((err) =>
					ctx.logger.error(
						err,
						"Failed to update calendar on appointment confirm",
					),
				);
			}
		}),

	getReminderTimeline: protectedProcedure
		.input(z.object({ appointmentId: z.string() }))
		.query(async ({ ctx, input }) => {
			const [quietSettings] = await ctx.db
				.select()
				.from(appointmentReminderSettings)
				.limit(1);

			const [appt] = await ctx.db
				.select({
					startTime: appointments.startTime,
					daEval: appointments.daEval,
					locationKey: appointments.locationKey,
					calendarEventTitle: appointments.calendarEventTitle,
					cancelled: appointments.cancelled,
					rescheduled: appointments.rescheduled,
					placeholder: appointments.placeholder,
					confirmedAt: appointments.confirmedAt,
					officeName: offices.prettyName,
					officeLocationPhrase: offices.locationPhrase,
				})
				.from(appointments)
				.leftJoin(offices, eq(appointments.locationKey, offices.key))
				.where(eq(appointments.id, input.appointmentId))
				.limit(1);

			if (!appt) return { sent: [], pending: [], appointmentTime: new Date() };

			const localStart = new Date(
				appt.startTime.getUTCFullYear(),
				appt.startTime.getUTCMonth(),
				appt.startTime.getUTCDate(),
				appt.startTime.getUTCHours(),
				appt.startTime.getUTCMinutes(),
				0,
			);

			const sent = await ctx.db
				.select({
					sentAt: reminderLogs.sentAt,
					templateName: reminderTemplates.name,
					templateId: reminderLogs.reminderTemplateId,
					messageTemplate: reminderTemplates.messageTemplate,
				})
				.from(reminderLogs)
				.innerJoin(
					reminderTemplates,
					eq(reminderLogs.reminderTemplateId, reminderTemplates.id),
				)
				.where(eq(reminderLogs.appointmentId, input.appointmentId))
				.orderBy(reminderLogs.sentAt);

			const templates = await ctx.db
				.select()
				.from(reminderTemplates)
				.where(eq(reminderTemplates.isActive, true));

			const sentTemplateIds = new Set(sent.map((s) => s.templateId));
			const now = new Date();
			const suppressed = appt.cancelled || appt.rescheduled || appt.placeholder;

			const pending: {
				scheduledFor: Date;
				quietAdjusted: boolean;
				templateName: string;
				condition: string | null;
				messageTemplate: string;
				isOverdue: boolean;
			}[] = [];

			if (!suppressed) {
				for (const template of templates) {
					if (sentTemplateIds.has(template.id)) continue;

					const raw = new Date(
						localStart.getTime() - template.sendOffsetHours * 60 * 60 * 1000,
					);
					const { scheduledFor, quietAdjusted } = adjustForQuietWindow(
						raw,
						quietSettings,
					);
					const isOverdue = scheduledFor <= now;
					// Skip only if both the scheduled send time AND the appointment itself are in the past
					if (isOverdue && localStart <= now) continue;

					if (template.isNoReplyFollowUp) {
						if (sent.length > 0 && !appt.confirmedAt) {
							pending.push({
								scheduledFor,
								quietAdjusted,
								templateName: template.name,
								condition: "if still unconfirmed",
								messageTemplate: template.messageTemplate,
								isOverdue,
							});
						}
						continue;
					}

					if (template.isConfirmedFollowUp) {
						pending.push({
							scheduledFor,
							quietAdjusted,
							templateName: template.name,
							condition: appt.confirmedAt ? null : "if confirmed",
							messageTemplate: template.messageTemplate,
							isOverdue,
						});
						continue;
					}

					const matchesKeyword =
						!!template.triggerKeyword &&
						!!appt.calendarEventTitle?.includes(template.triggerKeyword);
					const matchesDaEvalLocation =
						(template.triggerDaEval !== null ||
							(template.triggerLocationKey?.length ?? 0) > 0) &&
						(template.triggerDaEval === null ||
							appt.daEval === template.triggerDaEval) &&
						(!template.triggerLocationKey?.length ||
							(!!appt.locationKey &&
								template.triggerLocationKey.includes(appt.locationKey)));

					if (matchesKeyword || matchesDaEvalLocation) {
						pending.push({
							scheduledFor,
							quietAdjusted,
							templateName: template.name,
							condition: null,
							messageTemplate: template.messageTemplate,
							isOverdue,
						});
					}
				}
			}

			pending.sort(
				(a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime(),
			);

			return {
				sent,
				pending,
				appointmentTime: localStart,
				officeName: appt.officeName ?? null,
				officeLocationPhrase: appt.officeLocationPhrase ?? null,
			};
		}),
});

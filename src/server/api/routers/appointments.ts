import { count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	appointmentReminderSettings,
	appointments,
	evaluators,
	reminderLogs,
	reminderTemplates,
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
					locationKey: appointments.locationKey,
					calendarEventTitle: appointments.calendarEventTitle,
					confirmedAt: appointments.confirmedAt,
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
					appointments.locationKey,
					appointments.calendarEventTitle,
					appointments.confirmedAt,
					evaluators.providerName,
				)
				.orderBy(desc(appointments.startTime));
		}),

	updateStatus: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				confirmedAt: z.date().nullable().optional(),
				cancelled: z.boolean().optional(),
				rescheduled: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { id, ...data } = input;
			return ctx.db
				.update(appointments)
				.set(data)
				.where(eq(appointments.id, id));
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
					confirmedAt: appointments.confirmedAt,
				})
				.from(appointments)
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
			const suppressed = appt.cancelled || appt.rescheduled;

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
						template.triggerKeyword &&
						appt.calendarEventTitle?.includes(template.triggerKeyword);
					const matchesDaEvalLocation =
						template.triggerDaEval &&
						template.triggerLocationKey &&
						appt.daEval === template.triggerDaEval &&
						appt.locationKey === template.triggerLocationKey;

					if (matchesKeyword ?? matchesDaEvalLocation) {
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

			return { sent, pending, appointmentTime: localStart };
		}),
});

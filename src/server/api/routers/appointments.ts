import { count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	appointments,
	evaluators,
	reminderLogs,
	reminderTemplates,
} from "~/server/db/schema";

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

			if (!appt) return { sent: [], pending: [] };

			const sent = await ctx.db
				.select({
					sentAt: reminderLogs.sentAt,
					templateName: reminderTemplates.name,
					templateId: reminderLogs.reminderTemplateId,
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
				templateName: string;
				condition: string | null;
			}[] = [];

			if (!suppressed) {
				for (const template of templates) {
					if (sentTemplateIds.has(template.id)) continue;

					const scheduledFor = new Date(
						appt.startTime.getTime() -
							template.sendOffsetHours * 60 * 60 * 1000,
					);
					if (scheduledFor <= now) continue;

					if (template.isNoReplyFollowUp) {
						if (sent.length > 0 && !appt.confirmedAt) {
							pending.push({
								scheduledFor,
								templateName: template.name,
								condition: "if still unconfirmed",
							});
						}
						continue;
					}

					if (template.isConfirmedFollowUp) {
						pending.push({
							scheduledFor,
							templateName: template.name,
							condition: appt.confirmedAt ? null : "if confirmed",
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
							templateName: template.name,
							condition: null,
						});
					}
				}
			}

			pending.sort(
				(a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime(),
			);

			return { sent, pending };
		}),
});

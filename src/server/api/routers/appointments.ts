import { count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { appointments, evaluators, reminderLogs } from "~/server/db/schema";

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
});

import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { appointments, evaluators } from "~/server/db/schema";

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
					placeholder: appointments.placeholder,
					locationKey: appointments.locationKey,
					calendarEventTitle: appointments.calendarEventTitle,
					evaluatorName: evaluators.providerName,
				})
				.from(appointments)
				.leftJoin(evaluators, eq(appointments.evaluatorNpi, evaluators.npi))
				.where(eq(appointments.clientId, input.clientId))
				.orderBy(desc(appointments.startTime));
		}),
});

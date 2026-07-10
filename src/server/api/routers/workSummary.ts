import { and, asc, count, eq, gte, isNotNull, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import {
	appointments,
	clients,
	evaluators,
	pieceworkReportTracking,
	users,
	workSummaryConfig,
} from "~/server/db/schema";

function endOfDay(date: Date): Date {
	return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

export const workSummaryRouter = createTRPCRouter({
	getSummary: protectedProcedure
		.input(z.object({ startDate: z.date(), endDate: z.date() }))
		.query(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "pages:work-summary");

			const apptRows = await ctx.db
				.select({
					npi: evaluators.npi,
					providerName: evaluators.providerName,
					daEval: appointments.daEval,
					asdAdhd: appointments.asdAdhd,
					week: sql<number>`YEARWEEK(${appointments.startTime}, 1)`,
					ageGroup: sql<string>`CASE WHEN TIMESTAMPDIFF(YEAR, ${clients.dob}, ${appointments.startTime}) < 7 THEN 'young' ELSE 'older' END`,
					count: count(),
				})
				.from(appointments)
				.innerJoin(evaluators, eq(appointments.evaluatorNpi, evaluators.npi))
				.innerJoin(clients, eq(appointments.clientId, clients.id))
				.where(
					and(
						gte(appointments.startTime, input.startDate),
						lt(appointments.startTime, endOfDay(input.endDate)),
						eq(appointments.cancelled, false),
						eq(appointments.rescheduled, false),
						eq(appointments.placeholder, false),
						eq(appointments.billingOnly, false),
						isNotNull(appointments.daEval),
					),
				)
				.groupBy(
					evaluators.npi,
					evaluators.providerName,
					appointments.daEval,
					appointments.asdAdhd,
					sql`YEARWEEK(${appointments.startTime}, 1)`,
					sql`CASE WHEN TIMESTAMPDIFF(YEAR, ${clients.dob}, ${appointments.startTime}) < 7 THEN 'young' ELSE 'older' END`,
				);

			const evalDurationRows = await ctx.db
				.select({
					npi: evaluators.npi,
					appointmentDurations: evaluators.appointmentDurations,
				})
				.from(evaluators);

			const durationsMap = new Map<number, Record<string, number>>();
			for (const row of evalDurationRows) {
				durationsMap.set(
					row.npi,
					(row.appointmentDurations ?? {}) as Record<string, number>,
				);
			}

			const byNpi: Record<
				number,
				{ name: string; weekData: Record<string, Record<number, number>> }
			> = {};
			for (const row of apptRows) {
				byNpi[row.npi] ??= { name: row.providerName, weekData: {} };
				const entry = byNpi[row.npi];
				if (!entry) continue;
				const isDA = row.daEval === "DA";
				const diagKey = row.asdAdhd === "ASD+ADHD" ? "ASD" : row.asdAdhd;
				const baseKey =
					!isDA && diagKey
						? `${row.daEval}/${diagKey}`
						: (row.daEval ?? "Unknown");
				const key = isDA ? baseKey : `${baseKey}/${row.ageGroup}`;
				entry.weekData[key] ??= {};
				const weekMap = entry.weekData[key];
				if (weekMap) weekMap[row.week] = (weekMap[row.week] ?? 0) + row.count;
			}

			const appointmentSummary = Object.entries(byNpi)
				.map(([npi, { name, weekData }]) => ({
					npi: Number(npi),
					name,
					durations: durationsMap.get(Number(npi)) ?? {},
					weeklyData: Object.fromEntries(
						Object.entries(weekData).map(([key, weekCounts]) => [
							key,
							Object.values(weekCounts),
						]),
					) as Record<string, number[]>,
				}))
				.sort((a, b) => a.name.localeCompare(b.name));

			const reportRows = await ctx.db
				.select({
					writerEmail: pieceworkReportTracking.writerEmail,
					writerName: users.name,
					count: count(),
				})
				.from(pieceworkReportTracking)
				.leftJoin(
					users,
					eq(users.email, pieceworkReportTracking.writerEmail ?? ""),
				)
				.where(
					and(
						gte(pieceworkReportTracking.trackedDate, input.startDate),
						lte(pieceworkReportTracking.trackedDate, input.endDate),
					),
				)
				.groupBy(pieceworkReportTracking.writerEmail, users.name);

			const reportSummary = reportRows
				.map((row) => ({
					name: row.writerName ?? row.writerEmail ?? "Unknown",
					count: row.count,
				}))
				.sort((a, b) => a.name.localeCompare(b.name));

			const configRow = await ctx.db.query.workSummaryConfig.findFirst();
			const durationDefaults = (configRow?.appointmentDurationDefaults ??
				{}) as Record<string, number>;

			return {
				appointments: appointmentSummary,
				reports: reportSummary,
				durationDefaults,
			};
		}),

	getDefaults: protectedProcedure.query(async ({ ctx }) => {
		assertPermission(ctx.session.user, "settings:evaluators");
		const row = await ctx.db.query.workSummaryConfig.findFirst();
		return (row?.appointmentDurationDefaults ?? {}) as Record<string, number>;
	}),

	setDefaults: protectedProcedure
		.input(z.record(z.string(), z.number().nonnegative().int()))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:evaluators");
			ctx.logger.info(
				{ ...input, updatedBy: ctx.session.user.email },
				"Setting appointment duration defaults",
			);
			await ctx.db
				.insert(workSummaryConfig)
				.values({ id: 1, appointmentDurationDefaults: input })
				.onDuplicateKeyUpdate({ set: { appointmentDurationDefaults: input } });
		}),

	getAppointmentDetail: protectedProcedure
		.input(
			z.object({
				evaluatorNpi: z.number(),
				startDate: z.date(),
				endDate: z.date(),
			}),
		)
		.query(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "pages:work-summary");

			const rows = await ctx.db
				.select({
					id: appointments.id,
					clientName: clients.fullName,
					startTime: appointments.startTime,
					daEval: appointments.daEval,
					asdAdhd: appointments.asdAdhd,
				})
				.from(appointments)
				.innerJoin(clients, eq(appointments.clientId, clients.id))
				.where(
					and(
						eq(appointments.evaluatorNpi, input.evaluatorNpi),
						gte(appointments.startTime, input.startDate),
						lt(appointments.startTime, endOfDay(input.endDate)),
						eq(appointments.cancelled, false),
						eq(appointments.rescheduled, false),
						eq(appointments.placeholder, false),
						eq(appointments.billingOnly, false),
						isNotNull(appointments.daEval),
					),
				)
				.orderBy(asc(appointments.startTime));

			return rows;
		}),
});

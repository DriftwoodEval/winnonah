import { and, asc, count, eq, gte, isNotNull, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { localDateToDateOnly } from "~/lib/utils";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import {
	appointmentCheckins,
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

function average(nums: number[]): number {
	if (nums.length === 0) return 0;
	return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums: number[]): number {
	if (nums.length === 0) return 0;
	const sorted = [...nums].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
		: (sorted[mid] ?? 0);
}

function buildColKey(
	daEval: string,
	asdAdhd: string | null,
	ageGroup: string,
): string {
	const isDA = daEval === "DA";
	const diagKey = asdAdhd === "ASD+ADHD" ? "ASD" : asdAdhd;
	const baseKey = !isDA && diagKey ? `${daEval}/${diagKey}` : daEval;
	return isDA ? baseKey : `${baseKey}/${ageGroup}`;
}

// Mirrors the key/fallback logic the client uses in calcEstimatedMinutes,
// so a single appointment's expected duration matches what the totals card shows.
function lookupExpectedDuration(
	daEval: string,
	asdAdhd: string | null,
	ageGroup: string,
	isDA: boolean,
	durations: Record<string, number>,
	globalDefaults: Record<string, number>,
): number | undefined {
	const diagKey = asdAdhd === "ASD+ADHD" ? "ASD" : asdAdhd;
	const baseKey = !isDA && diagKey ? `${daEval}/${diagKey}` : daEval;
	const ageSuffix = !isDA ? `/${ageGroup}` : "";
	const lookup = (d: Record<string, number>): number | undefined =>
		(ageSuffix ? d[`${baseKey}${ageSuffix}`] : undefined) ??
		(ageSuffix ? d[`${daEval}${ageSuffix}`] : undefined) ??
		d[baseKey] ??
		d[daEval] ??
		(ageSuffix ? d[`default${ageSuffix}`] : undefined) ??
		d.default;
	return lookup(durations) ?? lookup(globalDefaults);
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

			const configRow = await ctx.db.query.workSummaryConfig.findFirst();
			const durationDefaults = (configRow?.appointmentDurationDefaults ??
				{}) as Record<string, number>;

			const byNpi: Record<
				number,
				{ name: string; weekData: Record<string, Record<number, number>> }
			> = {};
			for (const row of apptRows) {
				byNpi[row.npi] ??= { name: row.providerName, weekData: {} };
				const entry = byNpi[row.npi];
				if (!entry) continue;
				const key = buildColKey(
					row.daEval ?? "Unknown",
					row.asdAdhd,
					row.ageGroup,
				);
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
						gte(
							pieceworkReportTracking.trackedDate,
							localDateToDateOnly(input.startDate) as string,
						),
						lte(
							pieceworkReportTracking.trackedDate,
							localDateToDateOnly(input.endDate) as string,
						),
					),
				)
				.groupBy(pieceworkReportTracking.writerEmail, users.name);

			const reportSummary = reportRows
				.map((row) => ({
					name: row.writerName ?? row.writerEmail ?? "Unknown",
					count: row.count,
				}))
				.sort((a, b) => a.name.localeCompare(b.name));

			const checkinRows = await ctx.db
				.select({
					performedByEmail: appointmentCheckins.arrivedBy,
					performedByName: users.name,
					count: count(),
				})
				.from(appointmentCheckins)
				.leftJoin(users, eq(users.email, appointmentCheckins.arrivedBy ?? ""))
				.where(
					and(
						isNotNull(appointmentCheckins.arrivedAt),
						gte(appointmentCheckins.arrivedAt, input.startDate),
						lt(appointmentCheckins.arrivedAt, endOfDay(input.endDate)),
					),
				)
				.groupBy(appointmentCheckins.arrivedBy, users.name);

			const checkinSummary = checkinRows
				.map((row) => ({
					name: row.performedByName ?? row.performedByEmail ?? "Unknown",
					count: row.count,
				}))
				.sort((a, b) => a.name.localeCompare(b.name));

			const timingRows = await ctx.db
				.select({
					npi: evaluators.npi,
					providerName: evaluators.providerName,
					daEval: appointments.daEval,
					asdAdhd: appointments.asdAdhd,
					ageGroup: sql<string>`CASE WHEN TIMESTAMPDIFF(YEAR, ${clients.dob}, ${appointments.startTime}) < 7 THEN 'young' ELSE 'older' END`,
					week: sql<number>`YEARWEEK(${appointments.startTime}, 1)`,
					scheduledStart: appointments.startTime,
					arrivedAt: appointmentCheckins.arrivedAt,
					startedAt: appointmentCheckins.startedAt,
					leftAt: appointmentCheckins.leftAt,
				})
				.from(appointments)
				.innerJoin(evaluators, eq(appointments.evaluatorNpi, evaluators.npi))
				.innerJoin(clients, eq(appointments.clientId, clients.id))
				.innerJoin(
					appointmentCheckins,
					eq(appointmentCheckins.appointmentId, appointments.id),
				)
				.where(
					and(
						gte(appointments.startTime, input.startDate),
						lt(appointments.startTime, endOfDay(input.endDate)),
						eq(appointments.cancelled, false),
						eq(appointments.rescheduled, false),
						eq(appointments.placeholder, false),
						eq(appointments.billingOnly, false),
						isNotNull(appointments.daEval),
						isNotNull(appointmentCheckins.startedAt),
					),
				);

			const timingByNpi: Record<
				number,
				{ name: string; durationDiffs: number[]; lateStarts: number[] }
			> = {};
			// Total logged minutes per evaluator per week, from actual check-in
			// timing only (not extrapolated to appointments without check-ins).
			const loggedWeeklyByNpi: Record<number, Record<number, number>> = {};
			for (const row of timingRows) {
				if (!row.daEval || !row.startedAt) continue;
				timingByNpi[row.npi] ??= {
					name: row.providerName,
					durationDiffs: [],
					lateStarts: [],
				};
				const entry = timingByNpi[row.npi];
				if (!entry) continue;

				if (row.leftAt) {
					const actualMinutes =
						(row.leftAt.getTime() - row.startedAt.getTime()) / 60000;
					const expectedMinutes = lookupExpectedDuration(
						row.daEval,
						row.asdAdhd,
						row.ageGroup,
						row.daEval === "DA",
						durationsMap.get(row.npi) ?? {},
						durationDefaults,
					);
					if (expectedMinutes !== undefined) {
						entry.durationDiffs.push(actualMinutes - expectedMinutes);
					}

					loggedWeeklyByNpi[row.npi] ??= {};
					const weekMap = loggedWeeklyByNpi[row.npi];
					if (weekMap) {
						weekMap[row.week] = (weekMap[row.week] ?? 0) + actualMinutes;
					}
				}

				const expectedStart =
					row.arrivedAt &&
					row.arrivedAt.getTime() > row.scheduledStart.getTime()
						? row.arrivedAt
						: row.scheduledStart;
				entry.lateStarts.push(
					(row.startedAt.getTime() - expectedStart.getTime()) / 60000,
				);
			}

			const timingSummary = Object.entries(timingByNpi)
				.map(([npi, { name, durationDiffs, lateStarts }]) => ({
					npi: Number(npi),
					name,
					avgDurationDiff: average(durationDiffs),
					medianDurationDiff: median(durationDiffs),
					durationSampleSize: durationDiffs.length,
					avgLateStart: average(lateStarts),
					medianLateStart: median(lateStarts),
					lateStartSampleSize: lateStarts.length,
				}))
				.sort((a, b) => a.name.localeCompare(b.name));

			const appointmentSummaryWithActuals = appointmentSummary.map((row) => ({
				...row,
				loggedWeeklyMinutes: Object.values(loggedWeeklyByNpi[row.npi] ?? {}),
			}));

			return {
				appointments: appointmentSummaryWithActuals,
				reports: reportSummary,
				checkins: checkinSummary,
				timing: timingSummary,
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
					ageGroup: sql<string>`CASE WHEN TIMESTAMPDIFF(YEAR, ${clients.dob}, ${appointments.startTime}) < 7 THEN 'young' ELSE 'older' END`,
					startedAt: appointmentCheckins.startedAt,
					leftAt: appointmentCheckins.leftAt,
				})
				.from(appointments)
				.innerJoin(clients, eq(appointments.clientId, clients.id))
				.leftJoin(
					appointmentCheckins,
					eq(appointmentCheckins.appointmentId, appointments.id),
				)
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

			const evaluatorRow = await ctx.db.query.evaluators.findFirst({
				where: eq(evaluators.npi, input.evaluatorNpi),
			});
			const evaluatorDurations = (evaluatorRow?.appointmentDurations ??
				{}) as Record<string, number>;

			const configRow = await ctx.db.query.workSummaryConfig.findFirst();
			const durationDefaults = (configRow?.appointmentDurationDefaults ??
				{}) as Record<string, number>;

			return rows.map((row) => ({
				id: row.id,
				clientName: row.clientName,
				startTime: row.startTime,
				daEval: row.daEval,
				asdAdhd: row.asdAdhd,
				projectedMinutes: row.daEval
					? lookupExpectedDuration(
							row.daEval,
							row.asdAdhd,
							row.ageGroup,
							row.daEval === "DA",
							evaluatorDurations,
							durationDefaults,
						)
					: undefined,
				loggedMinutes:
					row.startedAt && row.leftAt
						? (row.leftAt.getTime() - row.startedAt.getTime()) / 60000
						: undefined,
			}));
		}),
});

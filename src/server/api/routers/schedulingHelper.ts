import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import {
	classifyAvailabilityEvents,
	mergeOutOfOfficeEvents,
	splitAvailabilityByOOO,
} from "~/lib/google";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import {
	appointments,
	clients,
	evaluators,
	offices,
	schedulingClients,
} from "~/server/db/schema";

const SCHEDULING_PERMISSION = "pages:scheduling";

export const schedulingHelperRouter = createTRPCRouter({
	getSchedulingQueueInfo: protectedProcedure
		.input(z.object({ clientId: z.number() }))
		.query(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, SCHEDULING_PERMISSION);

			const row = await ctx.db.query.schedulingClients.findFirst({
				where: eq(schedulingClients.clientId, input.clientId),
				columns: { office: true, evaluator: true, code: true },
			});

			return {
				office: row?.office ?? null,
				evaluatorNpi: row?.evaluator ?? null,
				code: row?.code ?? null,
			};
		}),

	getAvailability: protectedProcedure
		.input(
			z.object({
				evaluatorNpis: z.array(z.number()),
				start: z.date(),
				end: z.date(),
			}),
		)
		.query(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, SCHEDULING_PERMISSION);

			if (input.evaluatorNpis.length === 0) return {};

			const cookieHeader = ctx.headers.get("cookie") ?? "";
			const params = new URLSearchParams({
				npis: input.evaluatorNpis.join(","),
				start: input.start.toISOString(),
				end: input.end.toISOString(),
			});

			const response = await fetch(
				`${env.PY_API}/evaluators/availability?${params.toString()}`,
				{ headers: { Cookie: cookieHeader } },
			);

			if (!response.ok) {
				throw new Error(
					`Failed to fetch evaluator availability: ${response.status}`,
				);
			}

			const rawEventsByNpi = (await response.json()) as Record<
				string,
				Parameters<typeof classifyAvailabilityEvents>[0]
			>;

			const allOffices = await ctx.db.query.offices.findMany({});

			const result: Record<
				number,
				ReturnType<typeof classifyAvailabilityEvents>
			> = {};

			for (const [npiStr, rawEvents] of Object.entries(rawEventsByNpi)) {
				const npi = Number(npiStr);
				const events = classifyAvailabilityEvents(rawEvents, allOffices);

				const officeEvents = events.filter((event) => !event.isUnavailability);
				const outOfOfficeEvents = events.filter(
					(event) => event.isUnavailability,
				);

				if (outOfOfficeEvents.length === 0) {
					result[npi] = officeEvents.toSorted(
						(a, b) => a.start.getTime() - b.start.getTime(),
					);
					continue;
				}

				const finalAvailability = splitAvailabilityByOOO(
					officeEvents,
					outOfOfficeEvents,
				);
				const mergedOOO = mergeOutOfOfficeEvents(outOfOfficeEvents);
				const merged = [...finalAvailability, ...mergedOOO];
				merged.sort((a, b) => a.start.getTime() - b.start.getTime());
				result[npi] = merged;
			}

			return result;
		}),

	getEvaluatorDayAppointments: protectedProcedure
		.input(z.object({ evaluatorNpi: z.number(), date: z.string() }))
		.query(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, SCHEDULING_PERMISSION);

			// appointment startTime/endTime are stored as naive America/New_York
			// wall-clock values (see put_appointment_in_db), so day boundaries must be
			// built the same way getDayAhead does: parse the date's y/m/d locally,
			// then re-anchor with Date.UTC so no timezone shift is applied.
			const ref = new Date(`${input.date}T00:00:00`);
			const startOfDay = new Date(
				Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0),
			);
			const endOfDay = new Date(
				Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59),
			);

			return ctx.db
				.select({
					id: appointments.id,
					startTime: appointments.startTime,
					endTime: appointments.endTime,
					locationKey: appointments.locationKey,
					officeName: offices.prettyName,
					placeholder: appointments.placeholder,
				})
				.from(appointments)
				.leftJoin(offices, eq(appointments.locationKey, offices.key))
				.where(
					and(
						eq(appointments.evaluatorNpi, input.evaluatorNpi),
						gte(appointments.startTime, startOfDay),
						lte(appointments.startTime, endOfDay),
						eq(appointments.cancelled, false),
						ne(appointments.rescheduled, true),
					),
				)
				.orderBy(asc(appointments.startTime));
		}),

	// Mirrors appointments.getCalendarRange (same CalAppt-shaped output, for
	// reuse with CalendarGrid's CalendarDayView), but keeps placeholder rows -
	// getCalendarRange deliberately excludes them for the day-ahead evaluator
	// view, whereas this helper's whole point is showing placeholder holds.
	getOfficeCalendar: protectedProcedure
		.input(z.object({ date: z.string() }))
		.query(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, SCHEDULING_PERMISSION);

			const ref = new Date(`${input.date}T00:00:00`);
			const startOfDay = new Date(
				Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0),
			);
			const endOfDay = new Date(
				Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59),
			);

			const rows = await ctx.db
				.select({
					id: appointments.id,
					startTime: appointments.startTime,
					endTime: appointments.endTime,
					daEval: appointments.daEval,
					asdAdhd: appointments.asdAdhd,
					confirmedAt: appointments.confirmedAt,
					clientName: clients.fullName,
					clientHash: clients.hash,
					locationKey: appointments.locationKey,
					officeName: offices.prettyName,
					evaluatorNpi: appointments.evaluatorNpi,
					evaluatorName: evaluators.providerName,
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
						eq(appointments.billingOnly, false),
					),
				)
				.orderBy(asc(appointments.startTime));

			return rows.map((r) => ({ ...r, isCurrentUser: false }));
		}),

	createPlaceholder: protectedProcedure
		.input(
			z.object({
				clientId: z.number(),
				evaluatorNpi: z.number(),
				// Naive "YYYY-MM-DDTHH:mm:ss" wall-clock strings (America/New_York, no
				// offset) - matching how real appointment times are stored. Do not send
				// a Date/.toISOString() here, that would introduce a timezone shift.
				startTime: z.string(),
				endTime: z.string(),
				daEval: z.enum(["EVAL", "DA", "DAEVAL"]),
				locationKey: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, SCHEDULING_PERMISSION);

			const cookieHeader = ctx.headers.get("cookie") ?? "";
			const response = await fetch(`${env.PY_API}/appointments/placeholder`, {
				method: "POST",
				headers: {
					Cookie: cookieHeader,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					client_id: input.clientId,
					evaluator_npi: input.evaluatorNpi,
					start_time: input.startTime,
					end_time: input.endTime,
					da_eval: input.daEval,
					location_key: input.locationKey,
				}),
			});

			if (!response.ok) {
				throw new Error(
					`Failed to create placeholder appointment: ${response.status}`,
				);
			}

			return response.json() as Promise<{
				id: string;
				clientId: number;
				evaluatorNpi: number;
				startTime: string;
				endTime: string;
				daEval: "EVAL" | "DA" | "DAEVAL";
				locationKey: string;
				calendarEventId: string;
				calendarEventTitle: string;
			}>;
		}),

	deletePlaceholder: protectedProcedure
		.input(z.object({ appointmentId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, SCHEDULING_PERMISSION);

			const cookieHeader = ctx.headers.get("cookie") ?? "";
			const response = await fetch(
				`${env.PY_API}/appointments/placeholder/${input.appointmentId}`,
				{ method: "DELETE", headers: { Cookie: cookieHeader } },
			);

			if (!response.ok) {
				throw new Error(
					`Failed to delete placeholder appointment: ${response.status}`,
				);
			}

			return { status: "ok" as const };
		}),
});

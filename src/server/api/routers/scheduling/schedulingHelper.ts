import { TRPCError } from "@trpc/server";
import { fromZonedTime } from "date-fns-tz";
import { and, asc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { BUSINESS_TIMEZONE } from "~/lib/constants";
import {
	classifyAvailabilityEvents,
	mergeOutOfOfficeEvents,
	splitAvailabilityByOOO,
} from "~/lib/integrations/google";
import { formatInBusinessTime, getAppointmentsRequired } from "~/lib/utils";
import { diffValues, setAuditDetail } from "~/server/api/audit";
import {
	type Context,
	createTRPCRouter,
	permissionProcedure,
} from "~/server/api/trpc";
import {
	appointmentCheckins,
	appointments,
	clients,
	evaluators,
	offices,
	schedulingClients,
} from "~/server/db/schema";

async function parsePyApiError(response: Response): Promise<string> {
	const data = (await response.json().catch(() => null)) as {
		detail?: string;
	} | null;
	return data?.detail || `Request failed: ${response.status}`;
}

const SCHEDULING_HELPER_PERMISSION = "pages:scheduling-helper";

// Naive business-local wall-clock string, the same shape the mutations accept.
const toBusinessLocal = (date: Date) =>
	formatInBusinessTime(date, "yyyy-MM-dd'T'HH:mm:ss");

// A placeholder as it is stored now, for audit detail logged before the
// Python API deletes or changes it. Null when the row does not exist.
async function loadPlaceholderForAudit(
	db: Context["db"],
	appointmentId: string,
) {
	const row = await db.query.appointments.findFirst({
		where: eq(appointments.id, appointmentId),
		columns: {
			clientId: true,
			evaluatorNpi: true,
			startTime: true,
			endTime: true,
			daEval: true,
			locationKey: true,
			calendarEventId: true,
			calendarEventTitle: true,
		},
	});
	if (!row) return null;
	return {
		...row,
		startTime: toBusinessLocal(row.startTime),
		endTime: toBusinessLocal(row.endTime),
	};
}

export const schedulingHelperRouter = createTRPCRouter({
	getSchedulingQueueInfo: permissionProcedure(SCHEDULING_HELPER_PERMISSION)
		.input(z.object({ clientId: z.number() }))
		.query(async ({ ctx, input }) => {
			const row = await ctx.db.query.schedulingClients.findFirst({
				where: eq(schedulingClients.clientId, input.clientId),
				columns: { office: true, evaluator: true, code: true },
			});
			const client = await ctx.db.query.clients.findFirst({
				where: eq(clients.id, input.clientId),
				columns: {
					dob: true,
					asdAdhd: true,
					primaryInsurance: true,
					secondaryInsurance: true,
				},
			});
			const allInsurances = await ctx.db.query.insurances.findMany({
				with: {
					aliases: true,
					evaluators: { with: { evaluator: true } },
				},
			});

			return {
				appointmentsRequired: client
					? (getAppointmentsRequired(client, allInsurances) ?? null)
					: null,
				dob: client?.dob ?? null,
				asdAdhd: client?.asdAdhd ?? null,
				office: row?.office ?? null,
				evaluatorNpi: row?.evaluator ?? null,
				code: row?.code ?? null,
			};
		}),

	getAvailability: permissionProcedure(SCHEDULING_HELPER_PERMISSION)
		.input(
			z.object({
				evaluatorNpis: z.array(z.number()),
				start: z.date(),
				end: z.date(),
			}),
		)
		.query(async ({ ctx, input }) => {
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

				const plannedEvents = events.filter((event) => event.isPlanned);
				const officeEvents = events.filter(
					(event) => !event.isUnavailability && !event.isPlanned,
				);
				const outOfOfficeEvents = events.filter(
					(event) => event.isUnavailability,
				);

				if (outOfOfficeEvents.length === 0) {
					result[npi] = [...officeEvents, ...plannedEvents].toSorted(
						(a, b) => a.start.getTime() - b.start.getTime(),
					);
					continue;
				}

				const finalAvailability = splitAvailabilityByOOO(
					officeEvents,
					outOfOfficeEvents,
				);
				const mergedOOO = mergeOutOfOfficeEvents(outOfOfficeEvents);
				const merged = [...finalAvailability, ...mergedOOO, ...plannedEvents];
				merged.sort((a, b) => a.start.getTime() - b.start.getTime());
				result[npi] = merged;
			}

			return result;
		}),

	getEvaluatorDayAppointments: permissionProcedure(SCHEDULING_HELPER_PERMISSION)
		.input(z.object({ evaluatorNpi: z.number(), date: z.string() }))
		.query(async ({ ctx, input }) => {
			// Business-local calendar day, converted to true UTC boundaries
			// regardless of the server process's own timezone (see getDayAhead).
			const startOfDay = fromZonedTime(
				`${input.date}T00:00:00`,
				BUSINESS_TIMEZONE,
			);
			const endOfDay = fromZonedTime(
				`${input.date}T23:59:59.999`,
				BUSINESS_TIMEZONE,
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
	getOfficeCalendar: permissionProcedure(SCHEDULING_HELPER_PERMISSION)
		.input(z.object({ date: z.string() }))
		.query(async ({ ctx, input }) => {
			// Business-local calendar day, converted to true UTC boundaries
			// regardless of the server process's own timezone (see getDayAhead).
			const startOfDay = fromZonedTime(
				`${input.date}T00:00:00`,
				BUSINESS_TIMEZONE,
			);
			const endOfDay = fromZonedTime(
				`${input.date}T23:59:59.999`,
				BUSINESS_TIMEZONE,
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
					clientPhone: clients.phoneNumber,
					locationKey: appointments.locationKey,
					officeName: offices.prettyName,
					evaluatorNpi: appointments.evaluatorNpi,
					evaluatorName: evaluators.providerName,
					arrivedAt: appointmentCheckins.arrivedAt,
					arrivedBy: appointmentCheckins.arrivedBy,
					startedAt: appointmentCheckins.startedAt,
					startedBy: appointmentCheckins.startedBy,
					leftAt: appointmentCheckins.leftAt,
					leftBy: appointmentCheckins.leftBy,
					placeholder: appointments.placeholder,
				})
				.from(appointments)
				.innerJoin(evaluators, eq(appointments.evaluatorNpi, evaluators.npi))
				.innerJoin(clients, eq(appointments.clientId, clients.id))
				.leftJoin(offices, eq(appointments.locationKey, offices.key))
				.leftJoin(
					appointmentCheckins,
					eq(appointmentCheckins.appointmentId, appointments.id),
				)
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

	// Frees a real appointment's slot right away so it can be rebooked, before
	// the TherapyAppointment sync reports the cancellation or reschedule. The
	// flag is only a stopgap: every sync rewrites `cancelled` from the export,
	// and a moved start time clears it, so TA stays the source of truth.
	markAppointmentCancelled: permissionProcedure(SCHEDULING_HELPER_PERMISSION)
		.input(
			z.object({
				appointmentId: z.string(),
				reason: z.enum(["cancelled", "rescheduled"]),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const [appt] = await ctx.db
				.select({
					clientHash: clients.hash,
					evaluatorNpi: appointments.evaluatorNpi,
					startTime: appointments.startTime,
					daEval: appointments.daEval,
					locationKey: appointments.locationKey,
				})
				.from(appointments)
				.innerJoin(clients, eq(appointments.clientId, clients.id))
				.where(
					and(
						eq(appointments.id, input.appointmentId),
						eq(appointments.placeholder, false),
					),
				);
			if (!appt) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Appointment not found",
				});
			}

			setAuditDetail(ctx, {
				appointmentId: input.appointmentId,
				reason: input.reason,
				changes: { cancelled: { from: false, to: true } },
			});
			await ctx.db
				.update(appointments)
				.set({ cancelled: true })
				.where(eq(appointments.id, input.appointmentId));

			// What the helper needs to rebook the same appointment at a new time.
			return {
				clientHash: appt.clientHash,
				evaluatorNpi: appt.evaluatorNpi,
				date: formatInBusinessTime(appt.startTime, "yyyy-MM-dd"),
				daEval: appt.daEval,
				locationKey: appt.locationKey,
			};
		}),

	// Practice-wide appointment durations (minutes), used when an evaluator has
	// no duration of their own for a type.
	getDurationDefaults: permissionProcedure(SCHEDULING_HELPER_PERMISSION).query(
		async ({ ctx }) => {
			const row = await ctx.db.query.workSummaryConfig.findFirst();
			return (row?.appointmentDurationDefaults ?? {}) as Record<string, number>;
		},
	),

	createPlaceholder: permissionProcedure(SCHEDULING_HELPER_PERMISSION)
		.input(
			z.object({
				clientId: z.number(),
				evaluatorNpi: z.number(),
				// Naive "YYYY-MM-DDTHH:mm:ss" wall-clock strings (America/New_York, no
				// offset). The API localizes these to true UTC before storing (see
				// business_to_utc in python/api/app.py). Do not send a Date/.toISOString()
				// here, that would introduce a timezone shift.
				startTime: z.string(),
				endTime: z.string(),
				daEval: z.enum(["EVAL", "DA", "DAEVAL"]),
				locationKey: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
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
				throw new Error(await parsePyApiError(response));
			}

			const created = (await response.json()) as {
				id: string;
				clientId: number;
				evaluatorNpi: number;
				startTime: string;
				endTime: string;
				daEval: "EVAL" | "DA" | "DAEVAL";
				locationKey: string;
				calendarEventId: string;
				calendarEventTitle: string;
			};
			setAuditDetail(ctx, {
				...input,
				appointmentId: created.id,
				calendarEventId: created.calendarEventId,
				calendarEventTitle: created.calendarEventTitle,
			});
			return created;
		}),

	createShadowEvent: permissionProcedure(SCHEDULING_HELPER_PERMISSION)
		.input(
			z.object({
				appointmentId: z.string(),
				sourceEvaluatorNpi: z.number(),
				shadowingEvaluatorNpi: z.number(),
				// Naive business-local wall-clock strings, see createPlaceholder.
				startTime: z.string(),
				endTime: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const response = await fetch(`${env.PY_API}/appointments/shadow`, {
				method: "POST",
				headers: {
					Cookie: ctx.headers.get("cookie") ?? "",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					appointment_id: input.appointmentId,
					source_evaluator_npi: input.sourceEvaluatorNpi,
					shadowing_evaluator_npi: input.shadowingEvaluatorNpi,
					start_time: input.startTime,
					end_time: input.endTime,
				}),
			});

			if (!response.ok) {
				throw new Error(await parsePyApiError(response));
			}

			const created = (await response.json()) as { calendarEventId: string };
			setAuditDetail(ctx, {
				...input,
				calendarEventId: created.calendarEventId,
			});
			return created;
		}),

	deletePlaceholder: permissionProcedure(SCHEDULING_HELPER_PERMISSION)
		.input(z.object({ appointmentId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const deleted = await loadPlaceholderForAudit(
				ctx.db,
				input.appointmentId,
			);
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

			setAuditDetail(ctx, { ...input, deleted });

			return { status: "ok" as const };
		}),

	markPlaceholderBooked: permissionProcedure(SCHEDULING_HELPER_PERMISSION)
		.input(z.object({ appointmentId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			// The API deletes the client's other placeholders of the same type but
			// only returns a count, so find them before and see which are gone after.
			const booked = await ctx.db.query.appointments.findFirst({
				where: eq(appointments.id, input.appointmentId),
				columns: { clientId: true, daEval: true },
			});
			const candidates = booked
				? await ctx.db
						.select({
							id: appointments.id,
							startTime: appointments.startTime,
							evaluatorNpi: appointments.evaluatorNpi,
							locationKey: appointments.locationKey,
						})
						.from(appointments)
						.where(
							and(
								eq(appointments.clientId, booked.clientId),
								eq(appointments.placeholder, true),
								booked.daEval
									? eq(appointments.daEval, booked.daEval)
									: isNull(appointments.daEval),
								ne(appointments.id, input.appointmentId),
							),
						)
				: [];

			const cookieHeader = ctx.headers.get("cookie") ?? "";
			const response = await fetch(
				`${env.PY_API}/appointments/placeholder/${input.appointmentId}/booked`,
				{ method: "POST", headers: { Cookie: cookieHeader } },
			);

			if (!response.ok) {
				throw new Error(await parsePyApiError(response));
			}

			const result = (await response.json()) as { deleted: number };
			const remaining =
				candidates.length > 0
					? await ctx.db
							.select({ id: appointments.id })
							.from(appointments)
							.where(
								inArray(
									appointments.id,
									candidates.map((c) => c.id),
								),
							)
					: [];
			const remainingIds = new Set(remaining.map((r) => r.id));
			setAuditDetail(ctx, {
				...input,
				deletedCount: result.deleted,
				deletedPlaceholders: candidates
					.filter((c) => !remainingIds.has(c.id))
					.map((c) => ({ ...c, startTime: toBusinessLocal(c.startTime) })),
			});
			return result;
		}),

	movePlaceholder: permissionProcedure(SCHEDULING_HELPER_PERMISSION)
		.input(
			z.object({
				appointmentId: z.string(),
				evaluatorNpi: z.number(),
				// Naive wall-clock strings, see createPlaceholder above.
				startTime: z.string(),
				endTime: z.string(),
				locationKey: z.string(),
				// Omitted keeps the placeholder's current type.
				daEval: z.enum(["EVAL", "DA", "DAEVAL"]).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const before = await loadPlaceholderForAudit(ctx.db, input.appointmentId);
			const cookieHeader = ctx.headers.get("cookie") ?? "";
			const response = await fetch(
				`${env.PY_API}/appointments/placeholder/${input.appointmentId}`,
				{
					method: "PATCH",
					headers: {
						Cookie: cookieHeader,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						evaluator_npi: input.evaluatorNpi,
						start_time: input.startTime,
						end_time: input.endTime,
						location_key: input.locationKey,
						da_eval: input.daEval,
					}),
				},
			);

			if (!response.ok) {
				throw new Error(await parsePyApiError(response));
			}

			const moved = (await response.json()) as {
				id: string;
				evaluatorNpi: number;
				startTime: string;
				endTime: string;
				daEval: "EVAL" | "DA" | "DAEVAL";
				locationKey: string;
				calendarEventId: string;
				calendarEventTitle: string;
			};
			// Times are compared in the business-local form the input uses; the
			// response carries UTC instants.
			setAuditDetail(ctx, {
				appointmentId: input.appointmentId,
				changes: diffValues(before, {
					clientId: before?.clientId,
					evaluatorNpi: moved.evaluatorNpi,
					startTime: input.startTime,
					endTime: input.endTime,
					daEval: moved.daEval,
					locationKey: moved.locationKey,
					calendarEventId: moved.calendarEventId,
					calendarEventTitle: moved.calendarEventTitle,
				}),
			});
			return moved;
		}),

	// Batched per-evaluator existing appointments across a date range, so the
	// evaluator x day grid can show which office someone is already booked into
	// on a given day without one query per cell.
	getEvaluatorAppointmentsInRange: permissionProcedure(
		SCHEDULING_HELPER_PERMISSION,
	)
		.input(
			z.object({
				evaluatorNpis: z.array(z.number()),
				start: z.date(),
				end: z.date(),
			}),
		)
		.query(async ({ ctx, input }) => {
			if (input.evaluatorNpis.length === 0) return {};

			const rows = await ctx.db
				.select({
					id: appointments.id,
					evaluatorNpi: appointments.evaluatorNpi,
					startTime: appointments.startTime,
					endTime: appointments.endTime,
					locationKey: appointments.locationKey,
					daEval: appointments.daEval,
					asdAdhd: appointments.asdAdhd,
					officeName: offices.prettyName,
					placeholder: appointments.placeholder,
					clientName: clients.fullName,
					clientHash: clients.hash,
				})
				.from(appointments)
				.leftJoin(offices, eq(appointments.locationKey, offices.key))
				.leftJoin(clients, eq(appointments.clientId, clients.id))
				.where(
					and(
						inArray(appointments.evaluatorNpi, input.evaluatorNpis),
						gte(appointments.startTime, input.start),
						lte(appointments.startTime, input.end),
						eq(appointments.cancelled, false),
						ne(appointments.rescheduled, true),
						eq(appointments.billingOnly, false),
					),
				);

			const result: Record<
				number,
				{
					id: string;
					date: string;
					startTime: Date;
					endTime: Date;
					locationKey: string | null;
					daEval: string | null;
					asdAdhd: string | null;
					officeName: string | null;
					placeholder: boolean;
					clientName: string | null;
					clientHash: string | null;
				}[]
			> = {};
			for (const row of rows) {
				result[row.evaluatorNpi] ??= [];
				const list = result[row.evaluatorNpi];
				list?.push({
					id: row.id,
					date: formatInBusinessTime(row.startTime, "yyyy-MM-dd"),
					startTime: row.startTime,
					endTime: row.endTime,
					locationKey: row.locationKey,
					daEval: row.daEval,
					asdAdhd: row.asdAdhd,
					officeName: row.officeName,
					placeholder: row.placeholder,
					clientName: row.clientName,
					clientHash: row.clientHash,
				});
			}
			return result;
		}),

	planOffice: permissionProcedure(SCHEDULING_HELPER_PERMISSION)
		.input(
			z.object({
				evaluatorNpi: z.number(),
				date: z.string(),
				officeKey: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const officePrettyName =
				input.officeKey === "Virtual"
					? "Virtual"
					: await ctx.db.query.offices
							.findFirst({
								where: eq(offices.key, input.officeKey),
								columns: { prettyName: true },
							})
							.then((o) => o?.prettyName ?? input.officeKey);

			const cookieHeader = ctx.headers.get("cookie") ?? "";
			const response = await fetch(`${env.PY_API}/evaluators/planned-office`, {
				method: "POST",
				headers: {
					Cookie: cookieHeader,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					evaluator_npi: input.evaluatorNpi,
					date: input.date,
					title: `Planned: ${officePrettyName}`,
				}),
			});

			if (!response.ok) {
				throw new Error(`Failed to plan office: ${response.status}`);
			}

			const planned = (await response.json()) as { calendarEventId: string };
			setAuditDetail(ctx, {
				...input,
				calendarEventTitle: `Planned: ${officePrettyName}`,
				calendarEventId: planned.calendarEventId,
			});
			return planned;
		}),

	unplanOffice: permissionProcedure(SCHEDULING_HELPER_PERMISSION)
		.input(z.object({ evaluatorNpi: z.number(), date: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const cookieHeader = ctx.headers.get("cookie") ?? "";
			const response = await fetch(`${env.PY_API}/evaluators/planned-office`, {
				method: "DELETE",
				headers: {
					Cookie: cookieHeader,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					evaluator_npi: input.evaluatorNpi,
					date: input.date,
				}),
			});

			if (!response.ok) {
				throw new Error(`Failed to unplan office: ${response.status}`);
			}

			return { status: "ok" as const };
		}),
});

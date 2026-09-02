import { TRPCError } from "@trpc/server";
import { fromZonedTime } from "date-fns-tz";
import { and, asc, count, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import { isVirtualAppointment } from "~/lib/checkin";
import { BUSINESS_TIMEZONE } from "~/lib/constants";
import { formatInBusinessTime } from "~/lib/utils";
import {
	assertPermission,
	type Context,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import {
	appointmentCheckins,
	appointments,
	clients,
	evaluatorCheckins,
	evaluators,
	offices,
	reminderLogs,
	users,
} from "~/server/db/schema";

const checkinInputSchema = z.object({
	appointmentId: z.string(),
	occurredAt: z.date(),
});

const evaluatorCheckinInputSchema = z.object({
	evaluatorNpi: z.number(),
	date: z.string(),
	occurredAt: z.date(),
});

async function recordCheckin(
	ctx: { db: Context["db"] },
	appointmentId: string,
	field: "arrived" | "started" | "left",
	occurredAt: Date,
	by: string | null | undefined,
) {
	const payload =
		field === "arrived"
			? { arrivedAt: occurredAt, arrivedBy: by }
			: field === "started"
				? { startedAt: occurredAt, startedBy: by }
				: { leftAt: occurredAt, leftBy: by };

	const existing = await ctx.db.query.appointmentCheckins.findFirst({
		where: eq(appointmentCheckins.appointmentId, appointmentId),
	});

	if (existing) {
		await ctx.db
			.update(appointmentCheckins)
			.set(payload)
			.where(eq(appointmentCheckins.appointmentId, appointmentId));
	} else {
		await ctx.db
			.insert(appointmentCheckins)
			.values({ appointmentId, ...payload });
	}
}

async function loadAppointmentForCheckin(
	ctx: { db: Context["db"] },
	appointmentId: string,
) {
	const appt = await ctx.db.query.appointments.findFirst({
		where: eq(appointments.id, appointmentId),
	});
	if (!appt) throw new TRPCError({ code: "NOT_FOUND" });
	if (isVirtualAppointment(appt.locationKey)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Virtual appointments don't have a check-in.",
		});
	}
	return appt;
}

async function assertEvaluatorHasInPersonDay(
	ctx: { db: Context["db"] },
	evaluatorNpi: number,
	date: string,
) {
	const startOfDay = fromZonedTime(`${date}T00:00:00`, BUSINESS_TIMEZONE);
	const endOfDay = fromZonedTime(`${date}T23:59:59.999`, BUSINESS_TIMEZONE);
	const rows = await ctx.db
		.select({ locationKey: appointments.locationKey })
		.from(appointments)
		.where(
			and(
				eq(appointments.evaluatorNpi, evaluatorNpi),
				gte(appointments.startTime, startOfDay),
				lte(appointments.startTime, endOfDay),
				eq(appointments.cancelled, false),
				eq(appointments.rescheduled, false),
				eq(appointments.placeholder, false),
				eq(appointments.billingOnly, false),
			),
		);
	const hasInPerson = rows.some((r) => !isVirtualAppointment(r.locationKey));
	if (!hasInPerson) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"This evaluator has no in-person appointments that day to be in for.",
		});
	}
}

async function assertNotSelfCheckin(
	ctx: { db: Context["db"]; session: { user: { id: string } } },
	evaluatorNpi: number,
) {
	const userWithEvaluator = await ctx.db.query.users.findFirst({
		where: eq(users.id, ctx.session.user.id),
		with: { evaluator: true },
	});
	if (userWithEvaluator?.evaluator?.npi === evaluatorNpi) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Evaluators cannot check themselves in or out.",
		});
	}
}

async function recordEvaluatorCheckin(
	ctx: { db: Context["db"] },
	evaluatorNpi: number,
	date: string,
	field: "arrived" | "left",
	occurredAt: Date,
	by: string | null | undefined,
) {
	const payload =
		field === "arrived"
			? { arrivedAt: occurredAt, arrivedBy: by }
			: { leftAt: occurredAt, leftBy: by };

	const existing = await ctx.db.query.evaluatorCheckins.findFirst({
		where: and(
			eq(evaluatorCheckins.evaluatorNpi, evaluatorNpi),
			eq(evaluatorCheckins.date, date),
		),
	});

	if (existing) {
		await ctx.db
			.update(evaluatorCheckins)
			.set(payload)
			.where(
				and(
					eq(evaluatorCheckins.evaluatorNpi, evaluatorNpi),
					eq(evaluatorCheckins.date, date),
				),
			);
	} else {
		await ctx.db
			.insert(evaluatorCheckins)
			.values({ evaluatorNpi, date, ...payload });
	}
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
			// Business-local calendar day, converted to true UTC boundaries
			// regardless of the server process's own timezone.
			const dateOnly =
				input?.asDate ?? formatInBusinessTime(new Date(), "yyyy-MM-dd");
			const startOfDay = fromZonedTime(
				`${dateOnly}T00:00:00`,
				BUSINESS_TIMEZONE,
			);
			const endOfDay = fromZonedTime(
				`${dateOnly}T23:59:59.999`,
				BUSINESS_TIMEZONE,
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
							clientPhone: clients.phoneNumber,
							officeName: offices.prettyName,
							arrivedAt: appointmentCheckins.arrivedAt,
							arrivedBy: appointmentCheckins.arrivedBy,
							startedAt: appointmentCheckins.startedAt,
							startedBy: appointmentCheckins.startedBy,
							leftAt: appointmentCheckins.leftAt,
							leftBy: appointmentCheckins.leftBy,
						})
						.from(appointments)
						.innerJoin(clients, eq(appointments.clientId, clients.id))
						.leftJoin(offices, eq(appointments.locationKey, offices.key))
						.leftJoin(
							appointmentCheckins,
							eq(appointmentCheckins.appointmentId, appointments.id),
						)
						.where(
							and(
								eq(appointments.evaluatorNpi, userWithEvaluator.evaluator.npi),
								gte(appointments.startTime, startOfDay),
								lte(appointments.startTime, endOfDay),
								eq(appointments.cancelled, false),
								eq(appointments.rescheduled, false),
								eq(appointments.placeholder, false),
								eq(appointments.billingOnly, false),
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
					clientPhone: clients.phoneNumber,
					arrivedAt: appointmentCheckins.arrivedAt,
					arrivedBy: appointmentCheckins.arrivedBy,
					startedAt: appointmentCheckins.startedAt,
					startedBy: appointmentCheckins.startedBy,
					leftAt: appointmentCheckins.leftAt,
					leftBy: appointmentCheckins.leftBy,
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
						eq(appointments.placeholder, false),
						eq(appointments.billingOnly, false),
					),
				)
				.orderBy(asc(appointments.startTime));

			const evaluatorCheckinRows = await ctx.db
				.select({
					evaluatorNpi: evaluatorCheckins.evaluatorNpi,
					arrivedAt: evaluatorCheckins.arrivedAt,
					arrivedBy: evaluatorCheckins.arrivedBy,
					leftAt: evaluatorCheckins.leftAt,
					leftBy: evaluatorCheckins.leftBy,
				})
				.from(evaluatorCheckins)
				.where(eq(evaluatorCheckins.date, dateOnly));
			const evaluatorCheckinByNpi = new Map(
				evaluatorCheckinRows.map((r) => [r.evaluatorNpi, r]),
			);

			type EvaluatorCheckin = {
				arrivedAt: Date | null;
				arrivedBy: string | null;
				leftAt: Date | null;
				leftBy: string | null;
			};
			type EvaluatorEntry = {
				name: string;
				npi: number;
				isCurrentUser: boolean;
				checkin: EvaluatorCheckin;
				appointments: {
					id: string;
					startTime: Date;
					endTime: Date;
					locationKey: string | null;
					daEval: string | null;
					asdAdhd: string | null;
					confirmedAt: Date | null;
					clientName: string;
					clientHash: string;
					clientDriveId: string | null;
					clientTaHash: string | null;
					clientPhone: string | null;
					arrivedAt: Date | null;
					arrivedBy: string | null;
					startedAt: Date | null;
					startedBy: string | null;
					leftAt: Date | null;
					leftBy: string | null;
				}[];
			};
			type OfficeEntry = {
				officeName: string;
				locationKey: string;
				evaluators: Record<number, EvaluatorEntry>;
			};

			const byOffice: Record<string, OfficeEntry> = {};
			const currentNpi = userWithEvaluator?.evaluator?.npi;
			const emptyCheckin: EvaluatorCheckin = {
				arrivedAt: null,
				arrivedBy: null,
				leftAt: null,
				leftBy: null,
			};

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
					checkin: evaluatorCheckinByNpi.get(row.evaluatorNpi) ?? emptyCheckin,
					appointments: [],
				};
				officeEntry.evaluators[row.evaluatorNpi] = evalEntry;
				evalEntry.appointments.push({
					id: row.appointmentId,
					startTime: row.startTime,
					endTime: row.endTime,
					locationKey: row.locationKey ?? null,
					daEval: row.daEval ?? null,
					asdAdhd: row.asdAdhd ?? null,
					confirmedAt: row.confirmedAt ?? null,
					clientName: row.clientName,
					clientHash: row.clientHash,
					clientDriveId: row.clientDriveId ?? null,
					clientTaHash: row.clientTaHash ?? null,
					clientPhone: row.clientPhone ?? null,
					arrivedAt: row.arrivedAt ?? null,
					arrivedBy: row.arrivedBy ?? null,
					startedAt: row.startedAt ?? null,
					startedBy: row.startedBy ?? null,
					leftAt: row.leftAt ?? null,
					leftBy: row.leftBy ?? null,
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

	getCalendarRange: protectedProcedure
		.input(
			z.object({
				startDate: z.string(), // YYYY-MM-DD
				endDate: z.string(), // YYYY-MM-DD
				asUserId: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const startUTC = new Date(`${input.startDate}T00:00:00.000Z`);
			const endUTC = new Date(`${input.endDate}T23:59:59.999Z`);

			const viewAsId =
				process.env.NODE_ENV === "development" && input.asUserId
					? input.asUserId
					: ctx.session.user.id;

			const userWithEvaluator = await ctx.db.query.users.findFirst({
				where: eq(users.id, viewAsId),
				with: { evaluator: true },
			});
			const currentNpi = userWithEvaluator?.evaluator?.npi ?? null;

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
						gte(appointments.startTime, startUTC),
						lte(appointments.startTime, endUTC),
						eq(appointments.cancelled, false),
						eq(appointments.rescheduled, false),
						eq(appointments.placeholder, false),
						eq(appointments.billingOnly, false),
					),
				)
				.orderBy(asc(appointments.startTime));

			return rows.map((r) => ({
				id: r.id,
				startTime: r.startTime,
				endTime: r.endTime,
				daEval: r.daEval ?? null,
				asdAdhd: r.asdAdhd ?? null,
				confirmedAt: r.confirmedAt ?? null,
				clientName: r.clientName,
				clientHash: r.clientHash,
				clientPhone: r.clientPhone ?? null,
				locationKey: r.locationKey ?? null,
				officeName: r.officeName ?? null,
				evaluatorNpi: r.evaluatorNpi,
				evaluatorName: r.evaluatorName,
				isCurrentUser: r.evaluatorNpi === currentNpi,
				arrivedAt: r.arrivedAt ?? null,
				arrivedBy: r.arrivedBy ?? null,
				startedAt: r.startedAt ?? null,
				startedBy: r.startedBy ?? null,
				leftAt: r.leftAt ?? null,
				leftBy: r.leftBy ?? null,
			}));
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
					arrivedAt: appointmentCheckins.arrivedAt,
					arrivedBy: appointmentCheckins.arrivedBy,
					startedAt: appointmentCheckins.startedAt,
					startedBy: appointmentCheckins.startedBy,
					leftAt: appointmentCheckins.leftAt,
					leftBy: appointmentCheckins.leftBy,
				})
				.from(appointments)
				.leftJoin(evaluators, eq(appointments.evaluatorNpi, evaluators.npi))
				.leftJoin(reminderLogs, eq(appointments.id, reminderLogs.appointmentId))
				.leftJoin(
					appointmentCheckins,
					eq(appointmentCheckins.appointmentId, appointments.id),
				)
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
					appointmentCheckins.arrivedAt,
					appointmentCheckins.arrivedBy,
					appointmentCheckins.startedAt,
					appointmentCheckins.startedBy,
					appointmentCheckins.leftAt,
					appointmentCheckins.leftBy,
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

			if (confirmedAt !== undefined) {
				const confirmed = confirmedAt !== null;
				ctx.logger.info(
					{ appointmentId: id, by: ctx.session.user.email, confirmed },
					confirmed
						? "Appointment manually confirmed"
						: "Appointment confirmation removed",
				);

				const cookieHeader = ctx.headers.get("cookie") ?? "";
				void fetch(
					`${env.PY_API}/appointments/${id}/confirm-calendar?confirmed=${confirmed}`,
					{
						method: "POST",
						headers: { Cookie: cookieHeader },
					},
				).catch((err) =>
					ctx.logger.error(
						err,
						"Failed to sync calendar on appointment confirmation change",
					),
				);
			}
		}),

	getReminderTimeline: protectedProcedure
		.input(z.object({ appointmentId: z.string() }))
		.query(async ({ input }) => {
			const response = await fetch(
				`${env.PY_API}/pyapi/appointment-reminders/preview/${input.appointmentId}`,
			);
			if (!response.ok) {
				if (response.status === 404)
					return { sent: [], pending: [], appointmentTime: new Date() };
				throw new Error(`Failed to fetch reminder preview: ${response.status}`);
			}
			const data = (await response.json()) as {
				appointmentTime: string;
				officeName: string | null;
				officeLocationPhrase: string | null;
				sent: {
					sentAt: string;
					templateName: string;
					templateId: number;
					messageTemplate: string;
				}[];
				pending: {
					scheduledFor: string;
					quietAdjusted: boolean;
					templateName: string;
					condition: string | null;
					messageTemplate: string;
					isOverdue: boolean;
				}[];
			};
			return {
				sent: data.sent.map((s) => ({ ...s, sentAt: new Date(s.sentAt) })),
				pending: data.pending.map((p) => ({
					...p,
					scheduledFor: new Date(p.scheduledFor),
				})),
				appointmentTime: new Date(data.appointmentTime),
				officeName: data.officeName,
				officeLocationPhrase: data.officeLocationPhrase,
			};
		}),

	arrive: protectedProcedure
		.input(checkinInputSchema)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:appointments:checkin");

			await loadAppointmentForCheckin(ctx, input.appointmentId);

			await recordCheckin(
				ctx,
				input.appointmentId,
				"arrived",
				input.occurredAt,
				ctx.session.user.email,
			);
		}),

	start: protectedProcedure
		.input(checkinInputSchema)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:appointments:checkin");

			await loadAppointmentForCheckin(ctx, input.appointmentId);

			await recordCheckin(
				ctx,
				input.appointmentId,
				"started",
				input.occurredAt,
				ctx.session.user.email,
			);
		}),

	depart: protectedProcedure
		.input(checkinInputSchema)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:appointments:checkin");

			await loadAppointmentForCheckin(ctx, input.appointmentId);

			await recordCheckin(
				ctx,
				input.appointmentId,
				"left",
				input.occurredAt,
				ctx.session.user.email,
			);
		}),

	undoLastCheckinStep: protectedProcedure
		.input(z.object({ appointmentId: z.string() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:appointments:checkin");

			const existing = await ctx.db.query.appointmentCheckins.findFirst({
				where: eq(appointmentCheckins.appointmentId, input.appointmentId),
			});
			if (!existing) return;

			// Only the furthest-along step can be undone, so the chain
			// (arrived -> started -> left) never ends up with gaps.
			const payload = existing.leftAt
				? { leftAt: null, leftBy: null }
				: existing.startedAt
					? { startedAt: null, startedBy: null }
					: existing.arrivedAt
						? { arrivedAt: null, arrivedBy: null }
						: null;
			if (!payload) return;

			await ctx.db
				.update(appointmentCheckins)
				.set(payload)
				.where(eq(appointmentCheckins.appointmentId, input.appointmentId));
		}),

	getEvaluatorCheckins: protectedProcedure
		.input(
			z.object({
				startDate: z.string(), // YYYY-MM-DD
				endDate: z.string(), // YYYY-MM-DD
			}),
		)
		.query(async ({ ctx, input }) =>
			ctx.db
				.select({
					evaluatorNpi: evaluatorCheckins.evaluatorNpi,
					date: evaluatorCheckins.date,
					arrivedAt: evaluatorCheckins.arrivedAt,
					arrivedBy: evaluatorCheckins.arrivedBy,
					leftAt: evaluatorCheckins.leftAt,
					leftBy: evaluatorCheckins.leftBy,
				})
				.from(evaluatorCheckins)
				.where(
					and(
						gte(evaluatorCheckins.date, input.startDate),
						lte(evaluatorCheckins.date, input.endDate),
					),
				),
		),

	evaluatorArrive: protectedProcedure
		.input(evaluatorCheckinInputSchema)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:appointments:checkin");
			await assertNotSelfCheckin(ctx, input.evaluatorNpi);
			await assertEvaluatorHasInPersonDay(ctx, input.evaluatorNpi, input.date);

			ctx.logger.info(
				{
					evaluatorNpi: input.evaluatorNpi,
					date: input.date,
					by: ctx.session.user.email,
				},
				"Evaluator arrival recorded",
			);

			await recordEvaluatorCheckin(
				ctx,
				input.evaluatorNpi,
				input.date,
				"arrived",
				input.occurredAt,
				ctx.session.user.email,
			);
		}),

	evaluatorDepart: protectedProcedure
		.input(evaluatorCheckinInputSchema)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:appointments:checkin");
			await assertNotSelfCheckin(ctx, input.evaluatorNpi);
			await assertEvaluatorHasInPersonDay(ctx, input.evaluatorNpi, input.date);

			ctx.logger.info(
				{
					evaluatorNpi: input.evaluatorNpi,
					date: input.date,
					by: ctx.session.user.email,
				},
				"Evaluator departure recorded",
			);

			await recordEvaluatorCheckin(
				ctx,
				input.evaluatorNpi,
				input.date,
				"left",
				input.occurredAt,
				ctx.session.user.email,
			);
		}),

	undoLastEvaluatorCheckinStep: protectedProcedure
		.input(z.object({ evaluatorNpi: z.number(), date: z.string() }))
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:appointments:checkin");
			await assertNotSelfCheckin(ctx, input.evaluatorNpi);

			ctx.logger.info(
				{
					evaluatorNpi: input.evaluatorNpi,
					date: input.date,
					by: ctx.session.user.email,
				},
				"Evaluator check-in step undone",
			);

			const existing = await ctx.db.query.evaluatorCheckins.findFirst({
				where: and(
					eq(evaluatorCheckins.evaluatorNpi, input.evaluatorNpi),
					eq(evaluatorCheckins.date, input.date),
				),
			});
			if (!existing) return;

			// Only the furthest-along step can be undone, so the chain
			// (arrived -> left) never ends up with gaps.
			const payload = existing.leftAt
				? { leftAt: null, leftBy: null }
				: existing.arrivedAt
					? { arrivedAt: null, arrivedBy: null }
					: null;
			if (!payload) return;

			await ctx.db
				.update(evaluatorCheckins)
				.set(payload)
				.where(
					and(
						eq(evaluatorCheckins.evaluatorNpi, input.evaluatorNpi),
						eq(evaluatorCheckins.date, input.date),
					),
				);
		}),
});

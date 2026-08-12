import { TRPCError } from "@trpc/server";
import { fromZonedTime } from "date-fns-tz";
import { and, asc, count, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { env } from "~/env";
import {
	APPOINTMENT_CHECKIN_REASONS,
	BUSINESS_TIMEZONE,
} from "~/lib/constants";
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
	evaluators,
	offices,
	reminderLogs,
	users,
} from "~/server/db/schema";

const CHECKIN_REASON_WINDOW_MINUTES = 15;

const checkinInputSchema = z
	.object({
		appointmentId: z.string(),
		occurredAt: z.date(),
		reason: z.enum(APPOINTMENT_CHECKIN_REASONS).optional(),
		reasonNote: z.string().max(500).optional(),
	})
	.superRefine((data, ctx) => {
		if (data.reason === "OTHER" && !data.reasonNote?.trim()) {
			ctx.addIssue({
				code: "custom",
				message: "Please describe the reason.",
				path: ["reasonNote"],
			});
		}
	});

async function recordCheckin(
	ctx: { db: Context["db"] },
	appointmentId: string,
	field: "checkIn" | "checkOut",
	occurredAt: Date,
	by: string | null | undefined,
	reason: (typeof APPOINTMENT_CHECKIN_REASONS)[number] | undefined,
	reasonNote: string | undefined,
) {
	const payload =
		field === "checkIn"
			? {
					checkedInAt: occurredAt,
					checkedInBy: by,
					checkInReason: reason ?? null,
					checkInReasonNote: reason ? (reasonNote?.trim() ?? null) : null,
				}
			: {
					checkedOutAt: occurredAt,
					checkedOutBy: by,
					checkOutReason: reason ?? null,
					checkOutReasonNote: reason ? (reasonNote?.trim() ?? null) : null,
				};

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
							checkedInAt: appointmentCheckins.checkedInAt,
							checkedInBy: appointmentCheckins.checkedInBy,
							checkInReason: appointmentCheckins.checkInReason,
							checkInReasonNote: appointmentCheckins.checkInReasonNote,
							checkedOutAt: appointmentCheckins.checkedOutAt,
							checkedOutBy: appointmentCheckins.checkedOutBy,
							checkOutReason: appointmentCheckins.checkOutReason,
							checkOutReasonNote: appointmentCheckins.checkOutReasonNote,
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
					checkedInAt: appointmentCheckins.checkedInAt,
					checkedInBy: appointmentCheckins.checkedInBy,
					checkInReason: appointmentCheckins.checkInReason,
					checkInReasonNote: appointmentCheckins.checkInReasonNote,
					checkedOutAt: appointmentCheckins.checkedOutAt,
					checkedOutBy: appointmentCheckins.checkedOutBy,
					checkOutReason: appointmentCheckins.checkOutReason,
					checkOutReasonNote: appointmentCheckins.checkOutReasonNote,
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
					clientPhone: string | null;
					checkedInAt: Date | null;
					checkedInBy: string | null;
					checkInReason: string | null;
					checkInReasonNote: string | null;
					checkedOutAt: Date | null;
					checkedOutBy: string | null;
					checkOutReason: string | null;
					checkOutReasonNote: string | null;
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
					clientPhone: row.clientPhone ?? null,
					checkedInAt: row.checkedInAt ?? null,
					checkedInBy: row.checkedInBy ?? null,
					checkInReason: row.checkInReason ?? null,
					checkInReasonNote: row.checkInReasonNote ?? null,
					checkedOutAt: row.checkedOutAt ?? null,
					checkedOutBy: row.checkedOutBy ?? null,
					checkOutReason: row.checkOutReason ?? null,
					checkOutReasonNote: row.checkOutReasonNote ?? null,
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
				})
				.from(appointments)
				.innerJoin(evaluators, eq(appointments.evaluatorNpi, evaluators.npi))
				.innerJoin(clients, eq(appointments.clientId, clients.id))
				.leftJoin(offices, eq(appointments.locationKey, offices.key))
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
					checkedInAt: appointmentCheckins.checkedInAt,
					checkedInBy: appointmentCheckins.checkedInBy,
					checkInReason: appointmentCheckins.checkInReason,
					checkInReasonNote: appointmentCheckins.checkInReasonNote,
					checkedOutAt: appointmentCheckins.checkedOutAt,
					checkedOutBy: appointmentCheckins.checkedOutBy,
					checkOutReason: appointmentCheckins.checkOutReason,
					checkOutReasonNote: appointmentCheckins.checkOutReasonNote,
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
					appointmentCheckins.checkedInAt,
					appointmentCheckins.checkedInBy,
					appointmentCheckins.checkInReason,
					appointmentCheckins.checkInReasonNote,
					appointmentCheckins.checkedOutAt,
					appointmentCheckins.checkedOutBy,
					appointmentCheckins.checkOutReason,
					appointmentCheckins.checkOutReasonNote,
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
				ctx.logger.info(
					{ appointmentId: id, confirmedBy: ctx.session.user.email },
					"Appointment manually confirmed",
				);

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

	checkIn: protectedProcedure
		.input(checkinInputSchema)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:appointments:checkin");

			const appt = await ctx.db.query.appointments.findFirst({
				where: eq(appointments.id, input.appointmentId),
			});
			if (!appt) throw new TRPCError({ code: "NOT_FOUND" });

			const diffMinutes =
				Math.abs(input.occurredAt.getTime() - appt.startTime.getTime()) / 60000;
			if (diffMinutes > CHECKIN_REASON_WINDOW_MINUTES && !input.reason) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"A reason is required when check-in time is more than 15 minutes from the scheduled start.",
				});
			}

			await recordCheckin(
				ctx,
				input.appointmentId,
				"checkIn",
				input.occurredAt,
				ctx.session.user.email,
				input.reason,
				input.reasonNote,
			);
		}),

	checkOut: protectedProcedure
		.input(checkinInputSchema)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "clients:appointments:checkin");

			const appt = await ctx.db.query.appointments.findFirst({
				where: eq(appointments.id, input.appointmentId),
			});
			if (!appt) throw new TRPCError({ code: "NOT_FOUND" });

			const diffMinutes =
				Math.abs(input.occurredAt.getTime() - appt.endTime.getTime()) / 60000;
			if (diffMinutes > CHECKIN_REASON_WINDOW_MINUTES && !input.reason) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"A reason is required when check-out time is more than 15 minutes from the scheduled end.",
				});
			}

			await recordCheckin(
				ctx,
				input.appointmentId,
				"checkOut",
				input.occurredAt,
				ctx.session.user.email,
				input.reason,
				input.reasonNote,
			);
		}),
});

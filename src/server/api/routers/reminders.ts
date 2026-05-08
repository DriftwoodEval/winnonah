import { desc, eq } from "drizzle-orm";
import z from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	appointmentReminderSettings,
	appointments,
	clients,
	reminderLogs,
	reminderTemplates,
} from "~/server/db/schema";

export const reminderRouter = createTRPCRouter({
	getSettings: protectedProcedure.query(async ({ ctx }) => {
		const settings = await ctx.db
			.select()
			.from(appointmentReminderSettings)
			.limit(1);
		return settings[0];
	}),

	updateSettings: protectedProcedure
		.input(
			z.object({
				quietWindowStart: z.string().optional(),
				quietWindowEnd: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			return await ctx.db
				.update(appointmentReminderSettings)
				.set(input)
				.where(eq(appointmentReminderSettings.id, 1));
		}),

	getTemplates: protectedProcedure.query(({ ctx }) => {
		return ctx.db.select().from(reminderTemplates);
	}),

	upsertTemplate: protectedProcedure
		.input(
			z.object({
				id: z.number().optional(),
				name: z.string(),
				triggerKeyword: z.string().optional().nullable(),
				triggerDaEval: z.enum(["EVAL", "DA", "DAEVAL"]).optional().nullable(),
				triggerLocationKey: z.string().optional().nullable(),
				messageTemplate: z.string(),
				confirmationReply: z.string().optional().nullable(),
				sendOffsetHours: z.number().min(1),
				isActive: z.boolean(),
				isNoReplyFollowUp: z.boolean(),
				isConfirmedFollowUp: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { id, ...data } = input;
			if (id) {
				return await ctx.db
					.update(reminderTemplates)
					.set(data)
					.where(eq(reminderTemplates.id, id));
			}
			return await ctx.db.insert(reminderTemplates).values(data);
		}),

	deleteTemplate: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			return ctx.db
				.delete(reminderTemplates)
				.where(eq(reminderTemplates.id, input.id));
		}),

	getLogs: protectedProcedure
		.input(
			z.object({
				limit: z.number().default(50),
				offset: z.number().default(0),
			}),
		)
		.query(async ({ ctx, input }) => {
			return ctx.db
				.select({
					id: reminderLogs.id,
					sentAt: reminderLogs.sentAt,
					clientFirstName: clients.firstName,
					clientLastName: clients.lastName,
					clientHash: clients.hash,
					clientId: reminderLogs.clientId,
					appointmentStart: appointments.startTime,
					templateName: reminderTemplates.name,
				})
				.from(reminderLogs)
				.innerJoin(clients, eq(reminderLogs.clientId, clients.id))
				.innerJoin(
					appointments,
					eq(reminderLogs.appointmentId, appointments.id),
				)
				.innerJoin(
					reminderTemplates,
					eq(reminderLogs.reminderTemplateId, reminderTemplates.id),
				)
				.orderBy(desc(reminderLogs.sentAt))
				.limit(input.limit)
				.offset(input.offset);
		}),
});

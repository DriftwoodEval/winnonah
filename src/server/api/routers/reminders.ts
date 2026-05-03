import { eq } from "drizzle-orm";
import z from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
	appointmentReminderSettings,
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
});

import { z } from "zod";

export const reminderTemplateSchema = z.object({
	name: z.string().min(1, "Name is required"),
	triggerKeyword: z.string().optional().nullable(),
	triggerDaEval: z.enum(["EVAL", "DA", "DAEVAL"]).optional().nullable(),
	triggerLocationKey: z.string().optional().nullable(),
	messageTemplate: z.string().min(1, "Message template is required"),
	confirmationReply: z.string().optional().nullable(),
	sendOffsetHours: z.number().min(1, "Offset must be at least 1 hour"),
	isActive: z.boolean(),
	isNoReplyFollowUp: z.boolean(),
});

export type ReminderTemplateFormValues = z.infer<typeof reminderTemplateSchema>;

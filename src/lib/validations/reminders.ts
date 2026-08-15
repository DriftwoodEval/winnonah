import { z } from "zod";

export const reminderTemplateSchema = z
	.object({
		name: z.string().min(1, "Name is required"),
		triggerKeyword: z.string().optional().nullable(),
		triggerDaEval: z.enum(["EVAL", "DA", "DAEVAL"]).optional().nullable(),
		triggerLocationKey: z.array(z.string()).optional().nullable(),
		minAgeYears: z.number().int().min(0).optional().nullable(),
		maxAgeYears: z.number().int().min(0).optional().nullable(),
		messageTemplate: z.string().min(1, "Message template is required"),
		confirmationReply: z.string().optional().nullable(),
		sendOffsetHours: z.number().min(1, "Offset must be at least 1 hour"),
		isActive: z.boolean(),
		isNoReplyFollowUp: z.boolean(),
		isConfirmedFollowUp: z.boolean(),
	})
	.refine(
		(data) =>
			data.minAgeYears == null ||
			data.maxAgeYears == null ||
			data.minAgeYears <= data.maxAgeYears,
		{
			message: "Min age must be less than or equal to max age",
			path: ["minAgeYears"],
		},
	);

export type ReminderTemplateFormValues = z.infer<typeof reminderTemplateSchema>;

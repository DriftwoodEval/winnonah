import { z } from "zod";

export const reminderTemplateSchema = z.object({
	name: z.string().min(1, "Name is required"),
	triggerKeyword: z.string().min(1, "Trigger keyword is required"),
	messageTemplate: z.string().min(1, "Message template is required"),
	sendOffsetHours: z.number().min(1, "Offset must be at least 1 hour"),
	isActive: z.boolean(),
});

export type ReminderTemplateFormValues = z.infer<typeof reminderTemplateSchema>;

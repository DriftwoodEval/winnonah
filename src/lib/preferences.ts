import z from "zod";

export const homeWidgetSchema = z.object({
	id: z.string(),
	cols: z.number().int().min(1).max(4),
	rows: z.number().int().min(1).max(4),
});

/**
 * A user's display preferences, stored as one JSON object on `users.preferences`.
 * Every key is optional and a malformed value reads as unset, so each consumer
 * falls back to its own default. Add a new preference by adding a key here.
 */
export const userPreferencesSchema = z.object({
	homeWidgets: z.array(homeWidgetSchema).optional().catch(undefined),
	headerItems: z
		.object({
			desktop: z.array(z.string()).optional().catch(undefined),
			mobile: z.array(z.string()).optional().catch(undefined),
		})
		.optional()
		.catch(undefined),
	issueListOrder: z.array(z.string()).optional().catch(undefined),
	clientCardFields: z.array(z.string()).optional().catch(undefined),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

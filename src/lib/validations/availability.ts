import { format } from "date-fns";
import { z } from "zod";

export const DAYS_OF_WEEK = [
	{ label: "Mon", value: "MO" },
	{ label: "Tue", value: "TU" },
	{ label: "Wed", value: "WE" },
	{ label: "Thu", value: "TH" },
	{ label: "Fri", value: "FR" },
	{ label: "Sat", value: "SA" },
	{ label: "Sun", value: "SU" },
];

const baseAvailabilityFormSchema = z.object({
	startDate: z.date({
		message: "Start time is required.",
	}),
	endDate: z.date({
		message: "End time is required.",
	}),
	isUnavailability: z.boolean(),
	isRecurring: z.boolean(),
	recurrenceFreq: z.enum(["never", "daily", "weekly", "monthly"]),
	interval: z.number().min(1),
	weeklyDays: z.array(z.string()).optional(),
	monthlyDay: z.number().min(1).max(31).optional(),
	recurrenceEndDate: z.date().optional().nullable(),
	recurrenceCount: z.number().min(1).optional().nullable(),
	recurrenceEndType: z.enum(["never", "on", "after"]),
	officeKeys: z.array(z.string()).optional(),
	scope: z.enum(["this", "all"]).optional(),
});

export const availabilityFormSchema = baseAvailabilityFormSchema
	.refine((data) => data.startDate < data.endDate, {
		message: "End time must be after start time.",
		path: ["endDate"],
	})
	.refine(
		(data) =>
			data.isUnavailability ||
			(data.officeKeys !== undefined && data.officeKeys.length > 0),
		{
			message:
				"At least one office must be selected if not inputting availability.",
			path: ["officeKeys"],
		},
	);

export type AvailabilityFormValues = z.infer<typeof baseAvailabilityFormSchema>;

export function buildRRule(values: AvailabilityFormValues): string | undefined {
	if (!values.isRecurring || values.recurrenceFreq === "never") {
		return undefined;
	}

	let rrule = `RRULE:FREQ=${values.recurrenceFreq.toUpperCase()}`;

	if (values.interval > 1) {
		rrule += `;INTERVAL=${values.interval}`;
	}

	if (
		values.recurrenceFreq === "weekly" &&
		values.weeklyDays &&
		values.weeklyDays.length > 0
	) {
		rrule += `;BYDAY=${values.weeklyDays.join(",")}`;
	}

	if (values.recurrenceFreq === "monthly" && values.monthlyDay) {
		rrule += `;BYMONTHDAY=${values.monthlyDay}`;
	}

	if (values.recurrenceEndType === "on" && values.recurrenceEndDate) {
		const until = format(values.recurrenceEndDate, "yyyyMMdd'T'HHmmss'Z'");
		rrule += `;UNTIL=${until}`;
	} else if (values.recurrenceEndType === "after" && values.recurrenceCount) {
		rrule += `;COUNT=${values.recurrenceCount}`;
	}

	return rrule;
}

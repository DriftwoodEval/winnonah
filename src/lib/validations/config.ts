import { z } from "zod";

// Helper Schemas

const emailSchema = z.email();
const multiEmailSchema = z
	.string()
	.refine(
		(val) => {
			const emails = val
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			return emails.every((email) => z.email().safeParse(email).success);
		},
		{ message: "Invalid email format in list" },
	)
	.transform((val) =>
		val
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean)
			.join(","),
	);
const phoneRegex = /^\+?1\d{10}$/;
const initialsRegex = /^[A-Z]{1,4}$/; // Matches your max_length=4, to_upper constraint
const punchListRegex = /^.+![A-z]+\d*(:[A-z]+\d*)?$/;

// Service Schemas

export const serviceSchema = z.object({
	username: z.string(),
	password: z.string(),
});

export const serviceWithAdminSchema = serviceSchema.extend({
	admin_username: z.string(),
	admin_password: z.string(),
});

export const openPhoneUserSchema = z.object({
	id: z.string(),
});

export const openPhoneServiceSchema = z.object({
	key: z.string(),
	main_number: z.string().regex(phoneRegex, "Invalid phone format"),
	users: z.record(z.string(), openPhoneUserSchema),
});

export const kimaiServiceSchema = z.object({
	url: z.string(),
	token: z.string(),
});

export const servicesSchema = z.object({
	openphone: openPhoneServiceSchema,
	therapyappointment: serviceWithAdminSchema,
	medicaid: serviceSchema,
	mhs: serviceSchema,
	qglobal: serviceSchema,
	wps: serviceSchema,
	novopsych: serviceSchema,
	kimai: kimaiServiceSchema.optional(),
});

// Piecework Schemas

export const pieceworkCostsSchema = z.object({
	DA: z.number().nullable().optional(),
	ADHDDA: z.number().nullable().optional(),
	EVAL: z.number().nullable().optional(),
	DAEVAL: z.number().nullable().optional(),
	REPORT: z.number().nullable().optional(),
});

export const pieceworkConfigSchema = z.object({
	costs: z.record(z.string(), pieceworkCostsSchema),
	name_map: z.record(z.string(), z.string()),
	payroll_emails: z.record(z.string(), z.email()),
	// NPI of the one evaluator whose ADHD-only evaluation reports (a DA with no
	// separate EVAL) still count as billable piecework. For every other
	// evaluator those reports are not billable. Empty string when unset.
	adhd_piecework_evaluator_npi: z.string().default(""),
});

// --- Main Config Schemas ---

export const recordsContactSchema = z.object({
	email: multiEmailSchema,
	fax: z.boolean().default(false),
	aliases: z.array(z.string()).default([]),
});

export const configSchema = z.object({
	initials: z
		.string()
		.regex(initialsRegex)
		.transform((val) => val.trim().toUpperCase()),
	name: z.string(),
	referral_sender_name: z.string().default(""),
	private_pay_sender_name: z.string().default(""),
	email: multiEmailSchema,
	automated_email: emailSchema,
	qreceive_emails: z.array(emailSchema),
	tech_email: z.union([emailSchema, z.literal("")]).default(""),
	punch_list_id: z.string(),
	punch_list_range: z
		.string()
		.regex(punchListRegex, "Invalid sheet range format"),
	failed_sheet_id: z.string(),
	payroll_folder_id: z.string(),
	database_url: z.string(),
	business_timezone: z.string().default("America/New_York"),
	excluded_ta: z.array(z.string()),
	records_folder_id: z.string(),
	sent_records_folder_id: z.string(),
	records_emails: z.record(z.string(), recordsContactSchema),
	piecework: pieceworkConfigSchema,
});

// --- Client Schemas ---
export const additionalInsuranceAppointmentsSchema = z.object({
	maxUnitsPerDay: z.number().int().min(1),
	using90000BillingCode: z.boolean().optional(),
	max96130: z.number().int().min(1).optional(),
	max96131: z.number().int().min(1).optional(),
	max96136: z.number().int().min(1).optional(),
	max96137: z.number().int().min(1).optional(),
	maxAppt4Units: z.number().int().min(1).optional(),
});

// --- Root Schema ---

export const pythonConfigSchema = z.object({
	services: servicesSchema,
	config: configSchema,
});

// Read-side ("lenient") config schema.
//
// The stored Python config can be mid-setup: a field left blank, failing a
// format regex, or missing outright. `pythonConfigSchema` (enforced on save)
// rejects all of that. If the read path used it too, a single unfilled field
// would collapse the whole response to null and the QSuite settings page would
// render blank. This schema mirrors `pythonConfigSchema`'s shape but relaxes
// every constraint and defaults every leaf, so the form always loads and the
// gaps can be filled in. Saving still goes through the strict schema.
const lenientString = () => z.string().catch("");
const lenientRecord = <T extends z.ZodTypeAny>(value: T) =>
	z.record(z.string(), value).catch({});
// An object that falls back to its own all-defaulted shape when the stored
// value is missing or the wrong type, instead of failing the whole parse.
// Every leaf in `shape` must itself default (lenientString/lenientRecord/
// `.catch(...)`), so `parse({})` always succeeds.
const lenientObject = <T extends z.ZodRawShape>(shape: T) => {
	const schema = z.object(shape);
	return schema.catch(schema.parse({}));
};

const serviceShape = {
	username: lenientString(),
	password: lenientString(),
};
const lenientService = lenientObject(serviceShape);
const lenientServiceWithAdmin = lenientObject({
	...serviceShape,
	admin_username: lenientString(),
	admin_password: lenientString(),
});

const lenientServicesSchema = lenientObject({
	openphone: lenientObject({
		key: lenientString(),
		main_number: lenientString(),
		users: lenientRecord(lenientObject({ id: lenientString() })),
	}),
	therapyappointment: lenientServiceWithAdmin,
	medicaid: lenientService,
	mhs: lenientService,
	qglobal: lenientService,
	wps: lenientService,
	novopsych: lenientService,
	kimai: lenientObject({
		url: lenientString(),
		token: lenientString(),
	}).optional(),
});

const lenientConfigSchema = lenientObject({
	initials: lenientString(),
	name: lenientString(),
	referral_sender_name: lenientString(),
	private_pay_sender_name: lenientString(),
	email: lenientString(),
	automated_email: lenientString(),
	qreceive_emails: z.array(z.string()).catch([]),
	tech_email: lenientString(),
	punch_list_id: lenientString(),
	punch_list_range: lenientString(),
	failed_sheet_id: lenientString(),
	payroll_folder_id: lenientString(),
	database_url: lenientString(),
	business_timezone: z.string().catch("America/New_York"),
	excluded_ta: z.array(z.string()).catch([]),
	records_folder_id: lenientString(),
	sent_records_folder_id: lenientString(),
	records_emails: lenientRecord(
		lenientObject({
			email: lenientString(),
			fax: z.boolean().catch(false),
			aliases: z.array(z.string()).catch([]),
		}),
	),
	piecework: lenientObject({
		costs: lenientRecord(pieceworkCostsSchema.catch({})),
		name_map: lenientRecord(lenientString()),
		payroll_emails: lenientRecord(lenientString()),
		adhd_piecework_evaluator_npi: lenientString(),
	}),
});

export const lenientPythonConfigSchema = lenientObject({
	services: lenientServicesSchema,
	config: lenientConfigSchema,
});

export const appointmentSyncConfigSchema = z.object({
	trusted_appointment_ids: z.array(z.string()),
	ignored_appointment_ids: z.array(z.string()),
});

export type pythonConfig = z.infer<typeof pythonConfigSchema>;
export type AppointmentSyncConfig = z.infer<typeof appointmentSyncConfigSchema>;
export type AdditionalInsuranceAppointments = z.infer<
	typeof additionalInsuranceAppointmentsSchema
>;

const outreachAttemptSchema = z.object({
	attemptedAt: z.string(),
	attemptedBy: z.string().optional(),
	notes: z.string().optional(),
});

// One field-level change made to the referral tab after the client was pushed
// to the punchlist. The field itself holds the new value (the source of truth
// for every downstream program); this record preserves what the value was
// before the post-push edit so the change can be reconciled manually.
export const postPunchEditSchema = z.object({
	field: z.string(),
	label: z.string().optional(),
	previousValue: z.string().nullable(),
	newValue: z.string().nullable(),
	editedAt: z.string(),
	editedBy: z.string().optional(),
});

export const referralDataSchema = z.object({
	notes: z.string().optional(),
	postPunchEdits: z.array(postPunchEditSchema).optional(),
	schoolExplanation: z.string().optional(),
	privateSchool: z.enum(["yes", "no"]).nullable().optional(),
	otherNotes: z.string().optional(),
	locationPreference: z.string().optional(),
	needsReachOut: z.enum(["reach_out", "review"]).nullable().optional(),
	reachOutCompleted: z.boolean().optional(),
	followedByBabyNet: z.enum(["yes", "no"]).nullable().optional(),
	walking: z.enum(["yes", "no"]).nullable().optional(),
	outreachClaimedBy: z.string().optional(),
	outreachAttempts: z.array(outreachAttemptSchema).optional(),
	privatePayOutreachAttempts: z.array(outreachAttemptSchema).optional(),
});

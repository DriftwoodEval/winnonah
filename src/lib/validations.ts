import { z } from "zod";

// Helper Schemas

const emailSchema = z.email();
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
	phone: z.string(),
});

export const openPhoneServiceSchema = z.object({
	key: z.string(),
	main_number: z.string().regex(phoneRegex, "Invalid phone format"),
	users: z.record(z.string(), openPhoneUserSchema),
});

export const servicesSchema = z.object({
	openphone: openPhoneServiceSchema,
	therapyappointment: serviceWithAdminSchema,
	mhs: serviceSchema,
	qglobal: serviceSchema,
	wps: serviceSchema,
});

// Piecework Schemas

export const pieceworkCostsSchema = z.object({
	DA: z.number().nullable().optional(),
	EVAL: z.number().nullable().optional(),
	DAEVAL: z.number().nullable().optional(),
	REPORT: z.number().nullable().optional(),
});

export const pieceworkConfigSchema = z.object({
	costs: z.record(z.string(), pieceworkCostsSchema),
	name_map: z.record(z.string(), z.string()),
});

// --- Main Config Schemas ---

export const recordsContactSchema = z.object({
	email: emailSchema,
	fax: z.boolean().default(false),
});

export const configSchema = z.object({
	initials: z
		.string()
		.regex(initialsRegex)
		.transform((val) => val.trim().toUpperCase()),
	name: z.string(),
	email: emailSchema,
	automated_email: emailSchema,
	qreceive_emails: z.array(emailSchema),
	punch_list_id: z.string(),
	punch_list_range: z
		.string()
		.regex(punchListRegex, "Invalid sheet range format"),
	failed_sheet_id: z.string(),
	payroll_folder_id: z.string(),
	database_url: z.string(),
	excluded_ta: z.array(z.string()),
	records_folder_id: z.string(),
	sent_records_folder_id: z.string(),
	records_emails: z.record(z.string(), recordsContactSchema),
	piecework: pieceworkConfigSchema,
});

// --- Root Schema ---

export const pythonConfigSchema = z.object({
	services: servicesSchema,
	config: configSchema,
});

export type pythonConfig = z.infer<typeof pythonConfigSchema>;

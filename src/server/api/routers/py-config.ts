import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { env } from "~/env";
import type { PermissionsObject } from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import {
	appointmentSyncConfigSchema,
	pythonConfigSchema,
} from "~/lib/validations/config";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { pythonConfig } from "~/server/db/schema";

function assertQSuiteServicesAccess(perms: PermissionsObject) {
	if (
		!hasPermission(perms, "settings:qsuite:services") &&
		!hasPermission(perms, "settings:qsuite:services:view")
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You don't have permission to view QSuite services credentials",
		});
	}
}

// The full python config (services credentials, database_url, and other
// business config) is only for the QSuite settings tab, gated the same way
// that tab itself is: any one of its edit permissions grants access to view
// and submit the whole config, matching how the tab's single save button
// already works today.
function assertQSuiteConfigAccess(perms: PermissionsObject) {
	if (
		!hasPermission(perms, "settings:qsuite:general") &&
		!hasPermission(perms, "settings:qsuite:services") &&
		!hasPermission(perms, "settings:qsuite:records") &&
		!hasPermission(perms, "settings:qsuite:piecework")
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You don't have permission to view QSuite configuration",
		});
	}
}

function assertAppointmentsSyncAccess(perms: PermissionsObject) {
	if (!hasPermission(perms, "settings:appointments-sync")) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You don't have permission to manage appointments sync",
		});
	}
}

export const pyConfigRouter = createTRPCRouter({
	get: protectedProcedure.query(async ({ ctx }) => {
		assertQSuiteConfigAccess(ctx.session.user.permissions);

		const record = await ctx.db.query.pythonConfig.findFirst({
			where: eq(pythonConfig.id, 1),
		});

		if (!record?.data) return null;
		const result = pythonConfigSchema.safeParse(record.data);
		return result.success ? result.data : null;
	}),

	getPracticeName: protectedProcedure.query(async ({ ctx }) => {
		const record = await ctx.db.query.pythonConfig.findFirst({
			where: eq(pythonConfig.id, 1),
		});

		if (!record?.data) return "";
		const result = pythonConfigSchema.safeParse(record.data);
		return result.success ? result.data.config.name : "";
	}),

	getServices: protectedProcedure.query(async ({ ctx }) => {
		assertQSuiteServicesAccess(ctx.session.user.permissions);

		const record = await ctx.db.query.pythonConfig.findFirst({
			where: eq(pythonConfig.id, 1),
		});

		if (!record?.data) return null;
		const result = pythonConfigSchema.safeParse(record.data);
		if (!result.success) return null;

		const { therapyappointment, ...services } = result.data.services;
		return services;
	}),

	getPearsonVerificationEmail: protectedProcedure.mutation(async ({ ctx }) => {
		assertQSuiteServicesAccess(ctx.session.user.permissions);

		const cookieHeader = ctx.headers.get("cookie") ?? "";

		const response = await fetch(
			`${env.PY_API}/gmail/pearson-verification-code`,
			{
				headers: { Cookie: cookieHeader },
			},
		);

		if (response.status === 404) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "No Pearson verification code email found.",
			});
		}
		if (!response.ok) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch verification code email.",
			});
		}

		return (await response.json()) as {
			id: string;
			thread_id: string | null;
			subject: string | null;
			from: string | null;
			to: string | null;
			date: string | null;
			snippet: string | null;
			body_text: string | null;
			body_html: string | null;
		};
	}),

	update: protectedProcedure
		.input(pythonConfigSchema)
		.mutation(async ({ ctx, input }) => {
			assertQSuiteConfigAccess(ctx.session.user.permissions);

			ctx.logger.info(
				{ ...input, updatedBy: ctx.session.user.email },
				"Updating Python config",
			);
			await ctx.db
				.insert(pythonConfig)
				.values({ id: 1, data: input })
				.onDuplicateKeyUpdate({ set: { data: input } });

			return { success: true };
		}),

	getSync: protectedProcedure.query(async ({ ctx }) => {
		assertAppointmentsSyncAccess(ctx.session.user.permissions);

		const record = await ctx.db.query.pythonConfig.findFirst({
			where: eq(pythonConfig.id, 2),
		});

		if (record?.data) {
			const result = appointmentSyncConfigSchema.safeParse(record.data);
			if (result.success) return result.data;
		}

		return {
			trusted_appointment_ids: [],
			ignored_appointment_ids: [],
		};
	}),

	updateSync: protectedProcedure
		.input(appointmentSyncConfigSchema)
		.mutation(async ({ ctx, input }) => {
			assertAppointmentsSyncAccess(ctx.session.user.permissions);

			ctx.logger.info(
				{ ...input, updatedBy: ctx.session.user.email },
				"Updating Python appointment sync config",
			);
			await ctx.db
				.insert(pythonConfig)
				.values({ id: 2, data: input })
				.onDuplicateKeyUpdate({ set: { data: input } });

			return { success: true };
		}),
});

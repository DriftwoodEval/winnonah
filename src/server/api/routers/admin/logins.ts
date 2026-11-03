import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import z from "zod";
import {
	CUSTOM_LOGIN_FIELDS,
	canAccessLogin,
	getBuiltInLogin,
	LOGIN_VERBS,
	type LoginVerb,
	loginPermissionKey,
} from "~/lib/logins";
import { hasPermission } from "~/lib/utils";
import { diffValues, setAuditDetail } from "~/server/api/audit";
import { ensureBuiltInLogins } from "~/server/api/login-access";
import {
	assertPermission,
	createTRPCRouter,
	protectedProcedure,
} from "~/server/api/trpc";
import type { db } from "~/server/db";
import { loginHistory, logins, pythonConfig, users } from "~/server/db/schema";

type Db = typeof db;

type Services = Record<string, Record<string, unknown> | undefined>;

async function readServices(db: Db) {
	const record = await db.query.pythonConfig.findFirst({
		where: eq(pythonConfig.id, 1),
	});
	const data = (record?.data ?? {}) as { services?: Services };
	return { record, services: data.services ?? {} };
}

type HistoryEntry = {
	loginId: number;
	loginName: string;
	action: (typeof loginHistory.$inferInsert)["action"];
	detail?: Record<string, unknown>;
};

async function recordHistory(
	ctx: {
		db: Db;
		session: { user: { name?: string | null; email?: string | null } };
	},
	entry: HistoryEntry,
) {
	const { name, email } = ctx.session.user;
	await ctx.db
		.insert(loginHistory)
		.values({ ...entry, changedBy: name ?? email ?? "Unknown" });
}

const textField = z.string().trim().max(500);

const loginDetailsSchema = z.object({
	name: z.string().trim().min(1, "Name is required").max(255),
	url: textField,
	notes: z.string().trim().max(5000),
});

// Built-in logins the automated jobs use but that are never shown on the page.
const HIDDEN_BUILT_IN_KEYS = ["medicaid"];

export const loginsRouter = createTRPCRouter({
	// Whether the nav link should show: the user can create logins or reach at
	// least one existing one.
	hasAccess: protectedProcedure.query(async ({ ctx }) => {
		const user = ctx.session.user;
		if (hasPermission(user.permissions, "settings:qsuite:logins:create")) {
			return true;
		}
		const rows = await ctx.db.query.logins.findMany();
		return rows.some(
			(row) =>
				!HIDDEN_BUILT_IN_KEYS.includes(row.builtInKey ?? "") &&
				canAccessLogin(user, row, "view"),
		);
	}),

	// Every login the user may view, with its credentials and what they may do
	// to it.
	list: protectedProcedure.query(async ({ ctx }) => {
		const user = ctx.session.user;
		await ensureBuiltInLogins(ctx.db);

		const rows = await ctx.db.query.logins.findMany({
			orderBy: (logins, { asc }) => [asc(logins.name)],
		});
		const visible = rows.filter(
			(row) =>
				!HIDDEN_BUILT_IN_KEYS.includes(row.builtInKey ?? "") &&
				canAccessLogin(user, row, "view"),
		);
		if (visible.length === 0) return [];

		const { services } = await readServices(ctx.db);

		return visible.map((row) => {
			const builtIn = getBuiltInLogin(row.builtInKey);
			const fields = builtIn
				? builtIn.fields.map((field) => ({
						name: field.name,
						label: field.label,
						value: String(services[builtIn.key]?.[field.name] ?? ""),
					}))
				: CUSTOM_LOGIN_FIELDS.map((field) => ({
						name: field.name,
						label: field.label,
						value:
							(field.name === "username" ? row.username : row.password) ?? "",
					}));

			return {
				id: row.id,
				builtInKey: row.builtInKey,
				name: row.name,
				url: row.url ?? "",
				notes: row.notes ?? "",
				fields,
				canEdit: canAccessLogin(user, row, "edit"),
				canDelete: !builtIn && canAccessLogin(user, row, "delete"),
			};
		});
	}),

	create: protectedProcedure
		.input(
			loginDetailsSchema.extend({
				username: textField,
				password: z.string().max(500),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertPermission(ctx.session.user, "settings:qsuite:logins:create");

			const [result] = await ctx.db.insert(logins).values(input);

			// The creator keeps full access to what they create.
			const creator = await ctx.db.query.users.findFirst({
				where: eq(users.id, ctx.session.user.id),
				columns: { permissions: true },
			});
			const grants = Object.fromEntries(
				LOGIN_VERBS.map((verb) => [
					loginPermissionKey(result.insertId, verb),
					true,
				]),
			);
			await ctx.db
				.update(users)
				.set({ permissions: { ...creator?.permissions, ...grants } })
				.where(eq(users.id, ctx.session.user.id));

			await recordHistory(ctx, {
				loginId: result.insertId,
				loginName: input.name,
				action: "created",
				detail: { url: input.url, notes: input.notes },
			});

			setAuditDetail(ctx, {
				name: input.name,
				url: input.url,
				notes: input.notes,
			});
			return { success: true };
		}),

	update: protectedProcedure
		.input(
			loginDetailsSchema.extend({
				id: z.number(),
				// Keyed by field name: "username"/"password" for a custom login,
				// the services keys for a built-in one.
				fields: z.record(z.string(), z.string().max(500)),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const row = await ctx.db.query.logins.findFirst({
				where: eq(logins.id, input.id),
			});
			if (!row) throw new TRPCError({ code: "NOT_FOUND" });
			if (!canAccessLogin(ctx.session.user, row, "edit")) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You don't have permission to edit this login",
				});
			}

			const builtIn = getBuiltInLogin(row.builtInKey);
			const fieldDefs = builtIn ? builtIn.fields : CUSTOM_LOGIN_FIELDS;
			const changedFields: string[] = [];

			if (builtIn) {
				const { record, services } = await readServices(ctx.db);
				if (!record) {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: "The QSuite config has not been set up yet",
					});
				}
				const current = services[builtIn.key] ?? {};
				const updated = { ...current };
				for (const field of fieldDefs) {
					const next = input.fields[field.name];
					if (next === undefined || next === (current[field.name] ?? "")) {
						continue;
					}
					updated[field.name] = next;
					changedFields.push(field.label);
				}
				if (changedFields.length > 0) {
					await ctx.db
						.update(pythonConfig)
						.set({
							data: {
								...record.data,
								services: { ...services, [builtIn.key]: updated },
							} as typeof record.data,
						})
						.where(eq(pythonConfig.id, 1));
				}
			} else {
				if ((input.fields.username ?? "") !== (row.username ?? "")) {
					changedFields.push("User");
				}
				if ((input.fields.password ?? "") !== (row.password ?? "")) {
					changedFields.push("Password");
				}
			}

			await ctx.db
				.update(logins)
				.set({
					name: builtIn ? row.name : input.name,
					url: input.url,
					notes: input.notes,
					...(builtIn
						? {}
						: {
								username: input.fields.username ?? "",
								password: input.fields.password ?? "",
							}),
				})
				.where(eq(logins.id, input.id));

			// Credential values never go in the audit log or history, only which
			// ones changed.
			const details = diffValues(
				{ name: row.name, url: row.url ?? "", notes: row.notes ?? "" },
				{
					name: builtIn ? row.name : input.name,
					url: input.url,
					notes: input.notes,
				},
			);
			setAuditDetail(ctx, {
				login: row.name,
				details,
				changedCredentials: changedFields,
			});
			if (details !== undefined || changedFields.length > 0) {
				await recordHistory(ctx, {
					loginId: row.id,
					loginName: builtIn ? row.name : input.name,
					action: "updated",
					detail: { details, changedCredentials: changedFields },
				});
			}
			return { success: true };
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			const row = await ctx.db.query.logins.findFirst({
				where: eq(logins.id, input.id),
			});
			if (!row) throw new TRPCError({ code: "NOT_FOUND" });
			if (row.builtInKey) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Built-in logins can't be deleted",
				});
			}
			const verb: LoginVerb = "delete";
			if (!canAccessLogin(ctx.session.user, row, verb)) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You don't have permission to delete this login",
				});
			}

			await ctx.db.delete(logins).where(eq(logins.id, input.id));
			await recordHistory(ctx, {
				loginId: row.id,
				loginName: row.name,
				action: "deleted",
			});
			setAuditDetail(ctx, { login: row.name });
			return { success: true };
		}),

	// Every login, for the per-login checkboxes in the permissions editor.
	permissionList: protectedProcedure.query(async ({ ctx }) => {
		assertPermission(ctx.session.user, "settings:users:edit");
		await ensureBuiltInLogins(ctx.db);
		const rows = await ctx.db.query.logins.findMany({
			columns: { id: true, name: true, builtInKey: true },
			orderBy: (logins, { asc }) => [asc(logins.name)],
		});
		return rows
			.filter((row) => !HIDDEN_BUILT_IN_KEYS.includes(row.builtInKey ?? ""))
			.map(({ id, name }) => ({ id, name }));
	}),

	// Changes to one login, newest first. Needs edit access to that login.
	history: protectedProcedure
		.input(z.object({ id: z.number() }))
		.query(async ({ ctx, input }) => {
			const row = await ctx.db.query.logins.findFirst({
				where: eq(logins.id, input.id),
			});
			if (!row) throw new TRPCError({ code: "NOT_FOUND" });
			if (!canAccessLogin(ctx.session.user, row, "edit")) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You don't have permission to view this login's history",
				});
			}

			return await ctx.db.query.loginHistory.findMany({
				where: eq(loginHistory.loginId, input.id),
				orderBy: (history, { desc }) => [
					desc(history.createdAt),
					desc(history.id),
				],
			});
		}),
});

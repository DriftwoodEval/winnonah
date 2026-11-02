import { eq } from "drizzle-orm";
import {
	BUILT_IN_LOGINS,
	type BuiltInLoginKey,
	canAccessLogin,
	emptyLoginAccess,
	type LoginAccess,
} from "~/lib/logins";
import type { PermissionsObject } from "~/lib/types";
import type { db as database } from "~/server/db";
import { logins, users } from "~/server/db/schema";

type Db = typeof database;

type SessionUser = {
	id: string;
	roleId?: number | null;
	permissions: PermissionsObject;
};

// Per-platform view permissions that existed before logins had their own
// access lists. Anyone holding one keeps view access to that login.
const LEGACY_VIEW_PERMISSIONS: Partial<Record<BuiltInLoginKey, string>> = {
	mhs: "settings:qsuite:services:view:mhs",
	qglobal: "settings:qsuite:services:view:qglobal",
	wps: "settings:qsuite:services:view:wps",
	novopsych: "settings:qsuite:services:view:novopsych",
};

async function legacyViewAccess(db: Db, permission: string) {
	const [allRoles, allUsers] = await Promise.all([
		db.query.roles.findMany({
			columns: { id: true, permissions: true },
		}),
		db.query.users.findMany({
			where: eq(users.archived, false),
			columns: { id: true, permissions: true },
		}),
	]);
	const grants = (perms: PermissionsObject | null) =>
		(perms as Record<string, boolean | undefined> | null)?.[permission] ===
		true;
	return {
		roleIds: allRoles.filter((r) => grants(r.permissions)).map((r) => r.id),
		userIds: allUsers.filter((u) => grants(u.permissions)).map((u) => u.id),
	};
}

/**
 * Creates the row for any built-in login that doesn't have one yet. Built-in
 * rows hold only the notes, URL, and access list: the credentials stay in the
 * Python config. A new row starts with the access the old per-platform view
 * permissions granted.
 */
export async function ensureBuiltInLogins(db: Db) {
	const existing = await db.query.logins.findMany({
		columns: { builtInKey: true },
	});
	const existingKeys = new Set(existing.map((row) => row.builtInKey));

	for (const def of BUILT_IN_LOGINS) {
		if (existingKeys.has(def.key)) continue;

		const access: LoginAccess = emptyLoginAccess();
		const legacyPermission = LEGACY_VIEW_PERMISSIONS[def.key];
		if (legacyPermission) {
			access.view = await legacyViewAccess(db, legacyPermission);
		}

		// Another request may have created the row in the meantime.
		await db
			.insert(logins)
			.values({
				builtInKey: def.key,
				name: def.name,
				url: def.url,
				notes: def.notes,
				access,
			})
			.onDuplicateKeyUpdate({ set: { builtInKey: def.key } });
	}
}

/** Whether the user may view a built-in login (for endpoints keyed by platform). */
export async function canViewBuiltInLogin(
	db: Db,
	user: SessionUser,
	key: BuiltInLoginKey,
) {
	const row = await db.query.logins.findFirst({
		where: eq(logins.builtInKey, key),
	});
	return canAccessLogin(
		user,
		{ access: row?.access ?? emptyLoginAccess() },
		"view",
	);
}

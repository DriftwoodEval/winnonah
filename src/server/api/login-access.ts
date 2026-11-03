import { eq } from "drizzle-orm";
import {
	BUILT_IN_LOGINS,
	type BuiltInLoginKey,
	canAccessLogin,
} from "~/lib/logins";
import type { PermissionsObject } from "~/lib/types";
import type { db as database } from "~/server/db";
import { logins } from "~/server/db/schema";

type Db = typeof database;

type SessionUser = {
	id: string;
	roleId?: number | null;
	permissions: PermissionsObject;
};

/**
 * Creates the row for any built-in login that doesn't have one yet. Built-in
 * rows hold only the notes and URL: the credentials stay in the Python config.
 */
export async function ensureBuiltInLogins(db: Db) {
	const existing = await db.query.logins.findMany({
		columns: { builtInKey: true },
	});
	const existingKeys = new Set(existing.map((row) => row.builtInKey));

	for (const def of BUILT_IN_LOGINS) {
		if (existingKeys.has(def.key)) continue;

		// Another request may have created the row in the meantime.
		await db
			.insert(logins)
			.values({
				builtInKey: def.key,
				name: def.name,
				url: def.url,
				notes: def.notes,
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
	await ensureBuiltInLogins(db);
	const row = await db.query.logins.findFirst({
		where: eq(logins.builtInKey, key),
		columns: { id: true },
	});
	return !!row && canAccessLogin(user, row, "view");
}

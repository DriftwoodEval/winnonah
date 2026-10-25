import { eq, sql } from "drizzle-orm";
import { type UserPreferences, userPreferencesSchema } from "~/lib/preferences";
import type { db } from "~/server/db";
import { users } from "~/server/db/schema";

type Db = typeof db;

export async function readPreferences(
	database: Db,
	userId: string,
): Promise<UserPreferences> {
	const row = await database.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { preferences: true },
	});
	const parsed = userPreferencesSchema.safeParse(row?.preferences ?? {});
	return parsed.success ? parsed.data : {};
}

/**
 * Merges `patch` into the user's preferences in a single UPDATE, so two
 * preferences saved at the same moment cannot overwrite each other. Objects
 * merge key by key and arrays replace, so `{ headerItems: { desktop } }`
 * leaves the saved mobile list alone.
 */
export async function patchPreferences(
	database: Db,
	userId: string,
	patch: UserPreferences,
) {
	await database
		.update(users)
		.set({
			preferences: sql`JSON_MERGE_PATCH(COALESCE(${users.preferences}, JSON_OBJECT()), CAST(${JSON.stringify(patch)} AS JSON))`,
		})
		.where(eq(users.id, userId));
}

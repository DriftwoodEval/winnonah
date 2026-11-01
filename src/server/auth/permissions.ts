import { eq } from "drizzle-orm";
import type { PermissionsObject } from "~/lib/types";
import { db } from "~/server/db";
import { roles } from "~/server/db/schema";

/** A user's own permissions layered over their role's permissions. */
export async function resolvePermissions(user: {
	permissions: PermissionsObject | null;
	roleId: number | null;
}): Promise<PermissionsObject> {
	const own = user.permissions ?? {};
	if (!user.roleId) return own;

	const role = await db.query.roles.findFirst({
		where: eq(roles.id, user.roleId),
	});
	return role ? { ...role.permissions, ...own } : own;
}

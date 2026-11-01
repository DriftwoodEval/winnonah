import { eq } from "drizzle-orm";
import type { PermissionsObject } from "~/lib/types";
import { db } from "~/server/db";
import { roles } from "~/server/db/schema";

/** A user's own permissions layered over their role's permissions. */
export function mergePermissions(
	userPermissions: PermissionsObject | null,
	rolePermissions: PermissionsObject | null | undefined,
): PermissionsObject {
	return { ...rolePermissions, ...userPermissions };
}

export async function resolvePermissions(user: {
	permissions: PermissionsObject | null;
	roleId: number | null;
}): Promise<PermissionsObject> {
	if (!user.roleId) return user.permissions ?? {};

	const role = await db.query.roles.findFirst({
		where: eq(roles.id, user.roleId),
	});
	return mergePermissions(user.permissions, role?.permissions);
}

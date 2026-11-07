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

// Roles change rarely and are read on every session lookup, so they are kept
// in memory for a short time. Editing or deleting a role clears its entry (see
// `clearRoleCache`). The time limit only matters for another running copy of
// the app, such as the standby, which would not see that clear.
const ROLE_CACHE_SECONDS = 30;

type RoleCache = Map<
	number,
	{ permissions: PermissionsObject | undefined; expiresAt: number }
>;

// Kept on `globalThis` because the server renders pages and runs API routes
// from separate bundles that would otherwise each hold their own copy.
const globalForRoleCache = globalThis as unknown as {
	roleCache: RoleCache | undefined;
};
const roleCache: RoleCache = globalForRoleCache.roleCache ?? new Map();
globalForRoleCache.roleCache = roleCache;

/** Forgets a role's cached permissions, or every role's when no id is given. */
export function clearRoleCache(roleId?: number) {
	if (roleId === undefined) roleCache.clear();
	else roleCache.delete(roleId);
}

async function getRolePermissions(roleId: number) {
	const cached = roleCache.get(roleId);
	if (cached && cached.expiresAt > Date.now()) return cached.permissions;

	const role = await db.query.roles.findFirst({
		where: eq(roles.id, roleId),
	});
	roleCache.set(roleId, {
		permissions: role?.permissions,
		expiresAt: Date.now() + ROLE_CACHE_SECONDS * 1000,
	});
	return role?.permissions;
}

export async function resolvePermissions(user: {
	permissions: PermissionsObject | null;
	roleId: number | null;
}): Promise<PermissionsObject> {
	if (!user.roleId) return user.permissions ?? {};

	return mergePermissions(
		user.permissions,
		await getRolePermissions(user.roleId),
	);
}

export const userRoles = ["user", "admin", "superadmin"] as const;
export type UserRole = (typeof userRoles)[number];

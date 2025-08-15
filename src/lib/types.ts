export const userRoles = ["user", "evaluator", "admin", "superadmin"] as const;
export type UserRole = (typeof userRoles)[number];

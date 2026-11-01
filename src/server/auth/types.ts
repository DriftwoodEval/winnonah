import type { PermissionsObject } from "~/lib/types";

/**
 * The signed-in user, as served to the browser by `/api/auth/get-session`
 * and returned by `auth()` on the server. It never carries Google tokens.
 */
export interface SessionUser {
	id: string;
	name: string | null;
	email: string;
	image: string | null;
	permissions: PermissionsObject;
	roleId: number | null;
	isEvaluator: boolean;
	hasEvaluatorDashboard: boolean;
	archived: boolean | null;
	claimedReportFolder: { name: string; id: string }[] | null;
	maxClaimedReports: number | null;
	/** True when a permitted user is viewing the app as this user via the impersonation cookie. */
	isImpersonating: boolean;
	/** The real signed-in user's id, set only while `isImpersonating` is true. */
	impersonatorId: string | null;
	/** The real signed-in user's email, set only while `isImpersonating` is true. */
	impersonatorEmail: string | null;
	/** The real signed-in user's own permissions, regardless of any active impersonation. */
	realPermissions: PermissionsObject;
}

export interface Session {
	user: SessionUser;
	session: { id: string; expiresAt: Date };
}

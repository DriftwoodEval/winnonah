import type { PermissionsObject } from "~/lib/types";

/**
 * The signed-in user as the browser sees it (`useSession()` and
 * `/api/auth/get-session`). Google tokens are never part of this shape.
 */
export interface ClientSessionUser {
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

export interface ClientSession {
	user: ClientSessionUser;
	session: { id: string; expiresAt: Date };
}

/** The server-side session returned by `auth()`. Adds the user's Google tokens. */
export interface Session extends ClientSession {
	user: ClientSessionUser & {
		accessToken?: string;
		refreshToken?: string;
	};
}

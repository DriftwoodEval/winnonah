import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { customSession } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { env } from "~/env";
import type { PermissionsObject } from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import type { ClientSession } from "~/server/auth/types";
import { db } from "~/server/db";
import {
	accounts,
	auditLogs,
	evaluators,
	invitations,
	roles,
	sessions,
	users,
	verifications,
} from "~/server/db/schema";
import { IMPERSONATION_COOKIE } from "./impersonation";

const GOOGLE_SCOPES = [
	"https://www.googleapis.com/auth/spreadsheets",
	"https://www.googleapis.com/auth/drive",
	"https://www.googleapis.com/auth/calendar",
	"https://www.googleapis.com/auth/gmail.send",
];

/** A user's own permissions layered over their role's permissions. */
async function resolvePermissions(user: {
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

/**
 * Gives a brand-new user their starting permissions: the pending invitation
 * for their email if there is one, otherwise the default role with no
 * extra permissions. Also marks the invitation accepted and audits it.
 */
async function applyInvitationOrDefaults(user: { id: string; email: string }) {
	const invitation = await db.query.invitations.findFirst({
		where: and(
			eq(invitations.email, user.email),
			eq(invitations.status, "pending"),
		),
	});
	const defaultRole = await db.query.roles.findFirst({
		where: eq(roles.isDefault, true),
	});
	const roleId = invitation?.roleId ?? defaultRole?.id ?? null;

	await db
		.update(users)
		.set({
			permissions: (invitation?.permissions as PermissionsObject) ?? {},
			savedPlaces: invitation?.savedPlaces ?? null,
			roleId,
		})
		.where(eq(users.id, user.id));

	if (!invitation) return;

	await db
		.update(invitations)
		.set({ status: "accepted", usedAt: new Date() })
		.where(eq(invitations.id, invitation.id));

	await db.insert(auditLogs).values({
		userId: user.id,
		userEmail: user.email,
		action: "invitation.accepted",
		detail: { invitationId: invitation.id, roleId },
		success: true,
	});
}

export const authInstance = betterAuth({
	baseURL: env.AUTH_URL,
	secret: env.AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: "mysql",
		schema: {
			user: users,
			session: sessions,
			account: accounts,
			verification: verifications,
		},
	}),
	// Existing user ids are UUIDs, so new rows get the same format.
	advanced: { database: { generateId: "uuid" } },
	// Keep the existing column names. Better Auth field names are on the left,
	// the Drizzle schema keys in `~/server/db/schema` on the right.
	session: {
		expiresIn: 60 * 60 * 5, // 5 hours
		updateAge: 60 * 10, // 10 minutes
		fields: { token: "sessionToken", expiresAt: "expires" },
	},
	account: {
		fields: {
			providerId: "provider",
			accountId: "providerAccountId",
			accessToken: "access_token",
			refreshToken: "refresh_token",
			idToken: "id_token",
		},
	},
	socialProviders: {
		google: {
			clientId: env.AUTH_GOOGLE_ID,
			clientSecret: env.AUTH_GOOGLE_SECRET,
			// Rejects any sign-in whose verified ID token lacks this Workspace domain.
			hd: env.AUTH_GOOGLE_WORKSPACE_DOMAIN,
			accessType: "offline",
			scope: GOOGLE_SCOPES,
		},
	},
	onAPIError: { errorURL: "/auth/error" },
	databaseHooks: {
		user: {
			create: {
				before: async (user) => {
					if (!user.email || user.emailVerified !== true) return false;
				},
				after: async (user) => {
					await applyInvitationOrDefaults(user);
				},
			},
		},
		session: {
			create: {
				// Archived users cannot sign in, on first login or any later one.
				before: async (session) => {
					const userInDb = await db.query.users.findFirst({
						where: eq(users.id, session.userId),
						columns: { archived: true },
					});
					if (!userInDb || userInDb.archived) return false;
				},
			},
		},
	},
	hooks: {
		/**
		 * The "view as" cookie is app-set, not part of the auth session, so it
		 * survives sign-out on its own. On a shared browser that leaves it
		 * pointing at whatever user the previous person was impersonating, and
		 * the next person to sign in inherits it if they also hold
		 * settings:impersonate.
		 */
		after: createAuthMiddleware(async (ctx) => {
			if (ctx.path === "/sign-out") {
				ctx.setCookie(IMPERSONATION_COOKIE, "", { maxAge: 0, path: "/" });
			}
		}),
	},
	plugins: [
		customSession(async ({ user, session }, ctx): Promise<ClientSession> => {
			const realUser = await db.query.users.findFirst({
				where: eq(users.id, user.id),
			});
			if (!realUser) throw new Error("Session user not found");

			const realPermissions = await resolvePermissions(realUser);

			const impersonationId = ctx.getCookie(IMPERSONATION_COOKIE);
			const canImpersonate =
				!!impersonationId &&
				impersonationId !== realUser.id &&
				hasPermission(realPermissions, "settings:impersonate");
			const impersonatedUser = canImpersonate
				? await db.query.users.findFirst({
						where: eq(users.id, impersonationId),
					})
				: undefined;

			const isImpersonating = !!impersonatedUser;
			const targetUser = impersonatedUser ?? realUser;
			const permissions = isImpersonating
				? await resolvePermissions(targetUser)
				: realPermissions;

			const evaluatorProfile = await db.query.evaluators.findFirst({
				where: eq(evaluators.email, targetUser.email),
				columns: { npi: true, evaluatorDashboard: true },
			});

			return {
				session: { id: session.id, expiresAt: session.expiresAt },
				user: {
					id: targetUser.id,
					name: targetUser.name,
					email: targetUser.email,
					image: targetUser.image,
					permissions,
					roleId: targetUser.roleId,
					isEvaluator: !!evaluatorProfile,
					hasEvaluatorDashboard: evaluatorProfile?.evaluatorDashboard ?? false,
					archived: targetUser.archived,
					claimedReportFolder: targetUser.claimedReportFolder,
					maxClaimedReports: targetUser.maxClaimedReports,
					isImpersonating,
					impersonatorId: isImpersonating ? realUser.id : null,
					impersonatorEmail: isImpersonating ? realUser.email : null,
					realPermissions,
				},
			};
		}),
		// Must be the last plugin: lets server actions set the session cookie.
		nextCookies(),
	],
});

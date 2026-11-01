import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { customSession } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { env } from "~/env";
import type { PermissionsObject } from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import { impersonation } from "~/server/auth/impersonation";
import { resolvePermissions } from "~/server/auth/permissions";
import type { Session } from "~/server/auth/types";
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

const GOOGLE_SCOPES = [
	"https://www.googleapis.com/auth/spreadsheets",
	"https://www.googleapis.com/auth/drive",
	"https://www.googleapis.com/auth/calendar",
	"https://www.googleapis.com/auth/gmail.send",
];

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

const authOptions = {
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
	session: {
		expiresIn: 60 * 60 * 5, // 5 hours
		updateAge: 60 * 10, // 10 minutes
	},
	// App-owned user columns, read in `customSession`. Values are set by the
	// hooks below and by settings pages, never from request input.
	//
	// The `json` fields are only ever read here. On MySQL the adapter
	// stringifies JSON on write, which the Drizzle `json` columns would then
	// encode a second time, so JSON columns are written through Drizzle only.
	user: {
		additionalFields: {
			roleId: { type: "number", required: false, input: false },
			archived: { type: "boolean", required: false, input: false },
			maxClaimedReports: { type: "number", required: false, input: false },
			permissions: { type: "json", required: false, input: false },
			claimedReportFolder: { type: "json", required: false, input: false },
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
	plugins: [impersonation()],
} satisfies BetterAuthOptions;

export const authInstance = betterAuth({
	...authOptions,
	plugins: [
		...authOptions.plugins,
		customSession(async ({ user, session }, ctx): Promise<Session> => {
			// The session's user is whoever it acts as. While impersonating, the
			// real signed-in user is the one recorded on the session.
			const impersonatorId = session.impersonatedBy ?? null;
			const impersonator = impersonatorId
				? await db.query.users.findFirst({
						where: eq(users.id, impersonatorId),
					})
				: undefined;

			const permissions = await resolvePermissions({
				permissions: (user.permissions ?? null) as PermissionsObject | null,
				roleId: user.roleId ?? null,
			});
			let realPermissions = permissions;
			if (impersonatorId) {
				realPermissions = impersonator
					? await resolvePermissions(impersonator)
					: {};
				// Lost the permission (or was archived) since starting: end the session.
				if (
					impersonator?.archived ||
					!hasPermission(realPermissions, "settings:impersonate")
				) {
					await ctx.context.internalAdapter.deleteSession(session.token);
					throw APIError.fromStatus("UNAUTHORIZED", {
						message: "Viewing as another user has ended.",
					});
				}
			}

			const evaluatorProfile = await db.query.evaluators.findFirst({
				where: eq(evaluators.email, user.email),
				columns: { npi: true, evaluatorDashboard: true },
			});

			return {
				session: { id: session.id, expiresAt: session.expiresAt },
				user: {
					id: user.id,
					name: user.name,
					email: user.email,
					image: user.image ?? null,
					permissions,
					roleId: user.roleId ?? null,
					isEvaluator: !!evaluatorProfile,
					hasEvaluatorDashboard: evaluatorProfile?.evaluatorDashboard ?? false,
					archived: user.archived ?? null,
					claimedReportFolder: (user.claimedReportFolder ?? null) as
						| { name: string; id: string }[]
						| null,
					maxClaimedReports: user.maxClaimedReports ?? null,
					isImpersonating: !!impersonatorId,
					impersonatorId,
					impersonatorEmail: impersonator?.email ?? null,
					realPermissions,
				},
			};
		}, authOptions),
		// Must be the last plugin: lets server actions set the session cookie.
		nextCookies(),
	],
});

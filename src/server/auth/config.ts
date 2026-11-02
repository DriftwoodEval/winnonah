import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { type BetterAuthOptions, betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import { customSession } from "better-auth/plugins";
import { and, eq } from "drizzle-orm";
import { env } from "~/env";
import { logger } from "~/lib/logger";
import type { PermissionsObject } from "~/lib/types";
import { hasPermission } from "~/lib/utils";
import { recordAuthAudit } from "~/server/auth/audit";
import { CLIENT_IP_HEADERS } from "~/server/auth/client-ip";
import { clearCachedGoogleToken } from "~/server/auth/google-token-cache";
import { getImpersonatedBy, impersonation } from "~/server/auth/impersonation";
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

const authLogger = logger.child({ module: "auth" });

/**
 * HTTP endpoints under /api/auth that nothing uses. They answer 404. Only
 * requests from the browser are blocked: the server's own `auth.api` calls are
 * not affected.
 *
 * Some of these would be harmful if left open. `/update-user` lets anyone
 * rename themselves, and the app treats a user's name as their identity.
 * `/get-access-token` and `/refresh-token` hand a Google token to the browser,
 * including the target's token while viewing as another user.
 */
const DISABLED_PATHS = [
	"/sign-in/email",
	"/sign-up/email",
	"/request-password-reset",
	"/reset-password",
	"/change-password",
	"/verify-password",
	"/change-email",
	"/send-verification-email",
	"/verify-email",
	"/delete-user",
	"/delete-user/callback",
	"/update-user",
	"/update-session",
	"/link-social",
	"/unlink-account",
	"/list-accounts",
	"/account-info",
	"/get-access-token",
	"/refresh-token",
	"/list-sessions",
	"/revoke-session",
	"/revoke-sessions",
	"/revoke-other-sessions",
];

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

	// All or nothing, so a failure never leaves a user with half their setup.
	await db.transaction(async (tx) => {
		await tx
			.update(users)
			.set({
				permissions: (invitation?.permissions as PermissionsObject) ?? {},
				savedPlaces: invitation?.savedPlaces ?? null,
				roleId,
			})
			.where(eq(users.id, user.id));

		if (!invitation) return;

		await tx
			.update(invitations)
			.set({ status: "accepted", usedAt: new Date() })
			.where(eq(invitations.id, invitation.id));

		await tx.insert(auditLogs).values({
			userId: user.id,
			userEmail: user.email,
			action: "invitation.accepted",
			detail: { invitationId: invitation.id, roleId },
			success: true,
		});
	});
}

const authOptions = {
	baseURL: env.AUTH_URL,
	secret: env.AUTH_SECRET,
	trustedOrigins: env.AUTH_TRUSTED_ORIGINS?.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean),
	// The Python API reads the session on every request, so the defaults (3
	// sign-ins and 100 session reads per 10 seconds from one address) are too
	// tight for it.
	rateLimit: {
		customRules: {
			"/get-session": { window: 10, max: 300 },
			"/sign-in/social": { window: 10, max: 30 },
		},
	},
	database: drizzleAdapter(db, {
		provider: "mysql",
		schema: {
			user: users,
			session: sessions,
			account: accounts,
			verification: verifications,
		},
	}),
	advanced: {
		// Existing user ids are UUIDs, so new rows get the same format.
		database: { generateId: "uuid" },
		// Rate limits and `emr_session.ipAddress` use the real client address.
		ipAddress: { ipAddressHeaders: CLIENT_IP_HEADERS },
	},
	disabledPaths: DISABLED_PATHS,
	// Better Auth's own messages (a rejected Workspace domain, rate limit
	// problems) go to the app's log stream instead of the console.
	logger: {
		level: "warn",
		log: (level, message, ...args) => {
			authLogger[level]({ args }, message);
		},
	},
	telemetry: { enabled: false },
	account: {
		// Google access and refresh tokens are stored encrypted with the auth
		// secret. Tokens saved before this was on stay readable and are
		// encrypted the next time they are written.
		encryptOAuthTokens: true,
	},
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
					try {
						await applyInvitationOrDefaults(user);
					} catch (error) {
						// The user row exists but has no role or permissions yet. This hook
						// only runs when a user is created, so a retry would never fill them
						// in. Remove the row so the next sign-in starts over.
						authLogger.error(
							{ err: error, userId: user.id },
							"Could not set up a new user, removing them so sign-in can retry",
						);
						await db.delete(users).where(eq(users.id, user.id));
						throw error;
					}
				},
			},
		},
		// New or refreshed Google tokens make any cached access token stale.
		account: {
			create: { after: (account) => clearCachedGoogleToken(account.userId) },
			update: {
				after: async (account) => {
					if (account?.userId) await clearCachedGoogleToken(account.userId);
				},
			},
		},
		session: {
			create: {
				// Archived users cannot sign in, on first login or any later one.
				before: async (session) => {
					const userInDb = await db.query.users.findFirst({
						where: eq(users.id, session.userId),
						columns: { email: true, archived: true },
					});
					if (!userInDb) return false;
					if (userInDb.archived) {
						await recordAuthAudit({
							userId: session.userId,
							userEmail: userInDb.email,
							action: "auth.sign_in_blocked",
							success: false,
							errorMessage: "Account archived",
						});
						return false;
					}
				},
				// "View as" sessions are audited when they start, not here.
				after: async (session) => {
					if (getImpersonatedBy(session)) {
						return;
					}
					const userInDb = await db.query.users.findFirst({
						where: eq(users.id, session.userId),
						columns: { email: true },
					});
					if (!userInDb) return;
					await recordAuthAudit({
						userId: session.userId,
						userEmail: userInDb.email,
						action: "auth.sign_in",
						detail: { ipAddress: session.ipAddress || null },
					});
				},
			},
		},
	},
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path !== "/sign-out") return;
			const current = await getSessionFromCtx(ctx);
			if (!current) return;

			// While viewing as someone, the session's user is the person being
			// viewed. Record who actually signed out, as the audit log does for
			// other actions taken while viewing as someone.
			const impersonatorId = getImpersonatedBy(current.session);
			const impersonator = impersonatorId
				? await db.query.users.findFirst({
						where: eq(users.id, impersonatorId),
						columns: { email: true },
					})
				: undefined;
			await recordAuthAudit({
				userId: current.user.id,
				userEmail: current.user.email,
				impersonatedBy: impersonator?.email ?? impersonatorId ?? null,
				action: "auth.sign_out",
			});
		}),
	},
	plugins: [
		impersonation({
			canImpersonate: async (userId) => {
				const user = await db.query.users.findFirst({
					where: eq(users.id, userId),
				});
				return (
					!!user &&
					!user.archived &&
					hasPermission(await resolvePermissions(user), "settings:impersonate")
				);
			},
			onEvent: (event) =>
				recordAuthAudit({
					userId: event.userId,
					userEmail: event.userEmail,
					action: event.action,
					detail: {
						targetUserId: event.targetUserId,
						targetEmail: event.targetEmail,
					},
				}),
		}),
	],
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

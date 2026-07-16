import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm/sql";
import type { DefaultSession, NextAuthConfig } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { env } from "~/env";
import type { PermissionsObject } from "~/lib/types";
import { getImpersonationTargetId } from "~/server/auth/impersonation";

import { db } from "~/server/db";
import {
	accounts,
	evaluators,
	invitations,
	roles,
	sessions,
	users,
	verificationTokens,
} from "~/server/db/schema";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
	interface Session extends DefaultSession {
		accessToken?: string;
		user: {
			id: string;
			accessToken?: string;
			refreshToken?: string;
			permissions: PermissionsObject;
			roleId?: number | null;
			isEvaluator?: boolean;
			clientFilters?: string;
			archived?: boolean | null;
			claimedReportFolder?: { name: string; id: string }[] | null;
			maxClaimedReports?: number | null;
			/** True when a dev is viewing the app as this user via the impersonation cookie. */
			isImpersonating?: boolean;
		} & DefaultSession["user"];
	}

	interface User {
		permissions: PermissionsObject;
		roleId?: number | null;
		savedPlaces: string;
		archived?: boolean | null;
		claimedReportFolder?: { name: string; id: string }[] | null;
		maxClaimedReports?: number | null;
	}
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
	trustHost: true,
	providers: [
		GoogleProvider({
			clientId: process.env.AUTH_GOOGLE_ID,
			clientSecret: process.env.AUTH_GOOGLE_SECRET,
			authorization: {
				params: {
					hd: env.NEXT_PUBLIC_APP_HOST,
					access_type: "offline",
					response_type: "code",
					include_granted_scopes: "true",
					scope:
						"openid email profile https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar",
				},
			},
		}),
	],
	pages: {
		signIn: "/login",
		error: "/auth/error",
	},
	session: {
		maxAge: 60 * 60 * 5, // 5 hours
		updateAge: 60 * 10, // 10 minutes
	},
	adapter: DrizzleAdapter(db, {
		usersTable: users,
		accountsTable: accounts,
		sessionsTable: sessions,
		verificationTokensTable: verificationTokens,
	}),
	callbacks: {
		async signIn({ user, account }) {
			if (!user.email) return false;

			const userInDb = await db.query.users.findFirst({
				where: eq(users.email, user.email),
			});

			if (userInDb?.archived) {
				return false;
			}
			if (account?.provider === "google" && user.id) {
				const existingAccount = await db.query.accounts.findFirst({
					where: and(
						eq(accounts.userId, user.id),
						eq(accounts.provider, "google"),
						eq(accounts.providerAccountId, account.providerAccountId),
					),
				});

				if (existingAccount) {
					await db
						.update(accounts)
						.set({
							access_token: account.access_token,
							refresh_token:
								account.refresh_token ?? existingAccount.refresh_token,
							scope: account.scope,
							expires_at: account.expires_at,
							token_type: account.token_type,
							id_token: account.id_token,
						})
						.where(eq(accounts.userId, existingAccount.userId));
				}
			}

			if (userInDb) {
				return true;
			}

			const invitation = await db.query.invitations.findFirst({
				where: and(
					eq(invitations.email, user.email ?? ""),
					eq(invitations.status, "pending"),
				),
			});

			const defaultRole = await db.query.roles.findFirst({
				where: eq(roles.isDefault, true),
			});

			if (invitation) {
				user.permissions = invitation.permissions as PermissionsObject;
				user.savedPlaces = invitation.savedPlaces as string;
				user.roleId = invitation.roleId ?? defaultRole?.id ?? null;

				await db
					.update(invitations)
					.set({
						status: "accepted",
						usedAt: new Date(),
					})
					.where(eq(invitations.id, invitation.id));
			} else {
				user.permissions = {};
				user.roleId = defaultRole?.id ?? null;
			}

			return true;
		},

		async session({ session, user }) {
			const impersonationId = await getImpersonationTargetId();
			const isImpersonating = !!impersonationId && impersonationId !== user.id;

			const targetUser = isImpersonating
				? ((await db.query.users.findFirst({
						where: eq(users.id, impersonationId),
					})) ?? user)
				: user;

			const accountInDb = await db.query.accounts.findFirst({
				where: eq(accounts.userId, targetUser.id),
			});

			let accessToken: string | null = null;
			let refreshToken: string | null = null;

			if (accountInDb) {
				accessToken = accountInDb.access_token;
				refreshToken = accountInDb.refresh_token;
			}
			session.user.accessToken = accessToken ?? undefined;
			session.user.refreshToken = refreshToken ?? undefined;

			if (targetUser) {
				session.user.id = targetUser.id;
				session.user.name = targetUser.name;
				session.user.email = targetUser.email;
				session.user.image = targetUser.image;

				let effectivePermissions =
					(targetUser.permissions as PermissionsObject) ?? {};
				if (targetUser.roleId) {
					const role = await db.query.roles.findFirst({
						where: eq(roles.id, targetUser.roleId),
					});
					if (role) {
						effectivePermissions = {
							...role.permissions,
							...targetUser.permissions,
						};
					}
				}
				session.user.permissions = effectivePermissions;
				session.user.roleId = targetUser.roleId;

				session.user.archived = targetUser.archived;
				session.user.claimedReportFolder = targetUser.claimedReportFolder;
				session.user.maxClaimedReports = targetUser.maxClaimedReports;

				const evaluatorProfile = await db.query.evaluators.findFirst({
					where: eq(evaluators.email, targetUser.email ?? ""),
					columns: { npi: true },
				});
				session.user.isEvaluator = !!evaluatorProfile;

				session.user.isImpersonating =
					isImpersonating && targetUser.id === impersonationId;
			}
			return session;
		},
	},
} satisfies NextAuthConfig;

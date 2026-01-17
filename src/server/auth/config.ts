import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm/sql";
import type { DefaultSession, NextAuthConfig } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { type PermissionsObject, permissionPresets } from "~/lib/types";

import { db } from "~/server/db";
import {
	accounts,
	evaluators,
	invitations,
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
			evaluatorId?: number | null;
			clientFilters?: string;
			archived?: boolean | null;
		} & DefaultSession["user"];
	}

	interface User {
		permissions: PermissionsObject;
		savedPlaces: string;
		evaluatorId?: number | null;
		archived?: boolean | null;
	}
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
	providers: [
		GoogleProvider({
			clientId: process.env.AUTH_GOOGLE_ID,
			clientSecret: process.env.AUTH_GOOGLE_SECRET,
			authorization: {
				params: {
					access_type: "offline",
					response_type: "code",
					prompt: "consent",
					scope:
						"openid email profile https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar",
				},
			},
		}),
	],
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

				if (existingAccount && existingAccount.scope !== account.scope) {
					await db
						.update(accounts)
						.set({
							access_token: account.access_token,
							refresh_token: account.refresh_token,
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

			const evaluatorProfile = await db.query.evaluators.findFirst({
				where: eq(evaluators.email, user.email ?? ""),
			});

			if (evaluatorProfile) {
				user.evaluatorId = evaluatorProfile.npi;
			}

			const invitation = await db.query.invitations.findFirst({
				where: and(
					eq(invitations.email, user.email ?? ""),
					eq(invitations.status, "pending"),
				),
			});

			if (invitation) {
				user.permissions = invitation.permissions as PermissionsObject;
				user.savedPlaces = invitation.savedPlaces as string;

				await db
					.update(invitations)
					.set({
						status: "accepted",
						usedAt: new Date(),
					})
					.where(eq(invitations.id, invitation.id));
			} else {
				const preset = permissionPresets.find((p) => p.value === "user");
				if (preset) {
					user.permissions = preset.permissions as PermissionsObject;
				} else {
					user.permissions = {};
				}
			}

			return true;
		},

		async session({ session, user }) {
			const accountInDb = await db.query.accounts.findFirst({
				where: eq(accounts.userId, user.id),
			});

			let accessToken: string | null = null;
			let refreshToken: string | null = null;

			if (accountInDb) {
				accessToken = accountInDb.access_token;
				refreshToken = accountInDb.refresh_token;
			}
			session.user.accessToken = accessToken ?? undefined;
			session.user.refreshToken = refreshToken ?? undefined;

			if (user) {
				session.user.id = user.id;
				session.user.permissions = user.permissions;
				session.user.evaluatorId = user.evaluatorId;
				session.user.archived = user.archived;
			}
			return session;
		},
	},
} satisfies NextAuthConfig;

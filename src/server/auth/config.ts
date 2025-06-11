import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm/sql";
import type { DefaultSession, NextAuthConfig } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

import { db } from "~/server/db";
import {
	accounts,
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
			// ...other properties
			// role: UserRole;
		} & DefaultSession["user"];
	}

	// interface User {
	//   // ...other properties
	//   // role: UserRole;
	// }
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
					prompt: "consent",
					access_type: "offline",
					response_type: "code",
					scope:
						"openid email profile https://www.googleapis.com/auth/spreadsheets.readonly",
				},
			},
		}),
		/**
		 * ...add more providers here.
		 *
		 * Most other providers require a bit more work than the Discord provider. For example, the
		 * GitHub provider requires you to add the `refresh_token_expires_in` field to the Account
		 * model. Refer to the NextAuth.js docs for the provider you want to use. Example:
		 *
		 * @see https://next-auth.js.org/providers/github
		 */
	],
	adapter: DrizzleAdapter(db, {
		usersTable: users,
		accountsTable: accounts,
		sessionsTable: sessions,
		verificationTokensTable: verificationTokens,
	}),
	callbacks: {
		async session({ session, token, user }) {
			const getToken = await db.query.accounts.findFirst({
				where: eq(accounts.userId, user.id),
			});

			let accessToken: string | null = null;
			let refreshToken: string | null = null;

			if (getToken) {
				accessToken = getToken.access_token;
				refreshToken = getToken.refresh_token;
			}
			session.user.accessToken = accessToken ?? undefined;
			session.user.refreshToken = refreshToken ?? undefined;
			return session;
		},
	},
} satisfies NextAuthConfig;

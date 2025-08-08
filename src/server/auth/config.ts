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

export type UserRole = "superadmin" | "admin" | "user";

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
      role: UserRole;
    } & DefaultSession["user"];
  }

  // interface User {
  //   role: UserRole;
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
      profile(profile) {
        return {
          role: profile.role ?? "user",
          ...profile,
        };
      },
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
  ],
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  callbacks: {
    async session({ session, token, user }) {
      const accountInDb = await db.query.accounts.findFirst({
        where: eq(accounts.userId, user.id),
      });

      const userInDb = await db.query.users.findFirst({
        where: eq(users.id, user.id),
      });

      let accessToken: string | null = null;
      let refreshToken: string | null = null;

      if (accountInDb) {
        accessToken = accountInDb.access_token;
        refreshToken = accountInDb.refresh_token;
      }
      session.user.accessToken = accessToken ?? undefined;
      session.user.refreshToken = refreshToken ?? undefined;

      if (userInDb) {
        session.user.role = userInDb.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

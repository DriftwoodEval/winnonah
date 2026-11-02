import type { BetterAuthPlugin } from "better-auth";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	sessionMiddleware,
} from "better-auth/api";
import { expireCookie, setSessionCookie } from "better-auth/cookies";
import { eq } from "drizzle-orm";
import z from "zod";
import { hasPermission } from "~/lib/utils";
import { recordAuthAudit } from "~/server/auth/audit";
import { resolvePermissions } from "~/server/auth/permissions";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";

/** How long a "view as another user" session lasts. */
const IMPERSONATION_SECONDS = 60 * 60;

/**
 * "View as another user", gated behind the `settings:impersonate` permission.
 *
 * Starting creates a real session for the target user, marked with
 * `impersonatedBy`, so every part of the app (RSC, tRPC, the Python API) sees
 * that user with no special handling. The session is capped at one hour, and
 * the real session is kept aside in a signed cookie so stopping restores it.
 *
 * The permission is read from the real user's role and overrides (not a fixed
 * role string like Better Auth's admin plugin), so this is a small plugin of
 * our own.
 */
export const impersonation = () =>
	({
		id: "impersonation",
		schema: {
			session: {
				fields: {
					impersonatedBy: { type: "string", required: false, input: false },
				},
			},
		},
		endpoints: {
			startImpersonating: createAuthEndpoint(
				"/impersonation/start",
				{
					method: "POST",
					body: z.object({ userId: z.string() }),
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const current = ctx.context.session;
					// Switching from one impersonated user to another keeps the original
					// session and checks the permission of the person who started it.
					const currentImpersonatedBy = (
						current.session as { impersonatedBy?: string | null }
					).impersonatedBy;
					const realUserId = currentImpersonatedBy ?? current.user.id;

					const realUser = await db.query.users.findFirst({
						where: eq(users.id, realUserId),
					});
					const realPermissions = realUser
						? await resolvePermissions(realUser)
						: {};
					if (!hasPermission(realPermissions, "settings:impersonate")) {
						throw APIError.fromStatus("FORBIDDEN", {
							message: "You are not allowed to view as another user.",
						});
					}
					if (ctx.body.userId === realUserId) {
						throw APIError.fromStatus("BAD_REQUEST", {
							message: "Stop viewing as another user instead.",
						});
					}

					const target = await ctx.context.internalAdapter.findUserById(
						ctx.body.userId,
					);
					if (!target) {
						throw APIError.fromStatus("NOT_FOUND", {
							message: "User not found.",
						});
					}

					const session = await ctx.context.internalAdapter.createSession(
						target.id,
						true,
						{
							impersonatedBy: realUserId,
							expiresAt: new Date(Date.now() + IMPERSONATION_SECONDS * 1000),
						},
						true,
					);
					if (!session) {
						throw APIError.fromStatus("FORBIDDEN", {
							message: "That user cannot be viewed.",
						});
					}

					if (currentImpersonatedBy) {
						await ctx.context.internalAdapter.deleteSession(
							current.session.token,
						);
					} else {
						const dontRemember = await ctx.getSignedCookie(
							ctx.context.authCookies.dontRememberToken.name,
							ctx.context.secret,
						);
						const realSessionCookie =
							ctx.context.createAuthCookie("real_session");
						await ctx.setSignedCookie(
							realSessionCookie.name,
							`${current.session.token}:${dontRemember || ""}`,
							ctx.context.secret,
							ctx.context.authCookies.sessionToken.attributes,
						);
					}

					// `true` marks the session as non-renewing, so the one-hour cap holds.
					await setSessionCookie(ctx, { session, user: target }, true);
					await recordAuthAudit({
						userId: realUserId,
						userEmail: realUser?.email ?? "",
						action: "impersonation.started",
						detail: { targetUserId: target.id, targetEmail: target.email },
					});
					return ctx.json({ ok: true });
				},
			),
			stopImpersonating: createAuthEndpoint(
				"/impersonation/stop",
				{ method: "POST", use: [sessionMiddleware] },
				async (ctx) => {
					const current = ctx.context.session;
					const impersonatedBy = (
						current.session as { impersonatedBy?: string | null }
					).impersonatedBy;
					if (!impersonatedBy) {
						throw APIError.fromStatus("BAD_REQUEST", {
							message: "You are not viewing as another user.",
						});
					}

					const realSessionCookie =
						ctx.context.createAuthCookie("real_session");
					const saved = await ctx.getSignedCookie(
						realSessionCookie.name,
						ctx.context.secret,
					);
					const [token, dontRemember] = (saved || "").split(":");
					const realSession = token
						? await ctx.context.internalAdapter.findSession(token)
						: null;
					if (!realSession || realSession.session.userId !== impersonatedBy) {
						throw APIError.fromStatus("UNAUTHORIZED", {
							message: "Your own session has expired. Sign in again.",
						});
					}

					await ctx.context.internalAdapter.deleteSession(
						current.session.token,
					);
					await setSessionCookie(ctx, realSession, !!dontRemember);
					// Starting marked the session as non-renewing. Unless the real
					// session was already like that, lift the mark so it renews again.
					if (!dontRemember) {
						expireCookie(ctx, ctx.context.authCookies.dontRememberToken);
					}
					expireCookie(ctx, realSessionCookie);
					await recordAuthAudit({
						userId: realSession.user.id,
						userEmail: realSession.user.email,
						action: "impersonation.stopped",
						detail: {
							targetUserId: current.user.id,
							targetEmail: current.user.email,
						},
					});
					return ctx.json({ ok: true });
				},
			),
		},
		hooks: {
			after: [
				{
					matcher: (context) => context.path === "/sign-out",
					handler: createAuthMiddleware(async (ctx) => {
						expireCookie(ctx, ctx.context.createAuthCookie("real_session"));
					}),
				},
			],
		},
	}) satisfies BetterAuthPlugin;

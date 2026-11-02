import type { BetterAuthPlugin } from "better-auth";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	sessionMiddleware,
} from "better-auth/api";
import { expireCookie, setSessionCookie } from "better-auth/cookies";
import z from "zod";

/** How long a "view as another user" session lasts. */
const IMPERSONATION_SECONDS = 60 * 60;

/** The real user's id on a "view as" session, or null on any other session. */
export function getImpersonatedBy(session: object): string | null {
	return (session as { impersonatedBy?: string | null }).impersonatedBy ?? null;
}

export interface ImpersonationEvent {
	action: "impersonation.started" | "impersonation.stopped";
	/** The real user, who started or stopped viewing as someone else. */
	userId: string;
	userEmail: string;
	targetUserId: string;
	targetEmail: string;
}

export interface ImpersonationOptions {
	/** Whether a user is allowed to view the app as someone else. */
	canImpersonate: (userId: string) => Promise<boolean>;
	/** Told whenever a "view as" session starts or stops. */
	onEvent: (event: ImpersonationEvent) => Promise<void>;
}

/**
 * "View as another user".
 *
 * Starting creates a real session for the target user, marked with
 * `impersonatedBy`, so every part of the app (RSC, tRPC, the Python API) sees
 * that user with no special handling. The session is capped at one hour, and
 * the real session is kept aside in a signed cookie so stopping restores it.
 *
 * Who may do this is decided by `canImpersonate` (our role and permission
 * rules), not by a fixed role string like Better Auth's admin plugin uses, so
 * this is a small plugin of our own.
 */
export const impersonation = (options: ImpersonationOptions) =>
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
					const currentImpersonatedBy = getImpersonatedBy(current.session);
					const realUserId = currentImpersonatedBy ?? current.user.id;

					if (!(await options.canImpersonate(realUserId))) {
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
					const realUser =
						await ctx.context.internalAdapter.findUserById(realUserId);
					if (!realUser) {
						throw APIError.fromStatus("UNAUTHORIZED", {
							message: "Your own user could not be found.",
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
					await options.onEvent({
						action: "impersonation.started",
						userId: realUser.id,
						userEmail: realUser.email,
						targetUserId: target.id,
						targetEmail: target.email,
					});
					return ctx.json({ ok: true });
				},
			),
			stopImpersonating: createAuthEndpoint(
				"/impersonation/stop",
				{ method: "POST", use: [sessionMiddleware] },
				async (ctx) => {
					const current = ctx.context.session;
					const impersonatedBy = getImpersonatedBy(current.session);
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
					// The real session does not renew while viewing as someone else, so
					// it may have run out in the meantime.
					if (
						!realSession ||
						realSession.session.userId !== impersonatedBy ||
						realSession.session.expiresAt.getTime() <= Date.now()
					) {
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
					await options.onEvent({
						action: "impersonation.stopped",
						userId: realSession.user.id,
						userEmail: realSession.user.email,
						targetUserId: current.user.id,
						targetEmail: current.user.email,
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

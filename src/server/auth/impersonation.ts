/**
 * "View as another user" cookie, gated behind the `settings:impersonate` permission.
 * Read when the session is built (see `customSession` in `config.ts`) so that
 * everything downstream (RSC `auth()` calls, tRPC context, `useSession()` on the
 * client) sees the impersonated user instead of whoever actually signed in.
 */
export const IMPERSONATION_COOKIE = "impersonate-user-id";

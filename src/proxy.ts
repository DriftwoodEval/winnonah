import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Sends visitors without a session cookie to the sign-in page before any page
 * is rendered. This only checks that the cookie exists. Whether the session is
 * still valid, and what the user may see, is checked by `Guard` and the API.
 */
export function proxy(request: NextRequest) {
	if (getSessionCookie(request)) return NextResponse.next();

	const loginUrl = new URL("/login", request.url);
	const { pathname, search } = request.nextUrl;
	loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
	return NextResponse.redirect(loginUrl);
}

export const config = {
	// Pages only: not the API routes (which answer 401 themselves), Next.js
	// internals, files with an extension, or the pages used to sign in.
	matcher: ["/((?!api|_next|login|auth|.*\\..*).*)"],
};

import type { BetterAuthClientPlugin } from "better-auth/client";
import { customSessionClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { authInstance } from "~/server/auth/config";
import type { impersonation } from "~/server/auth/impersonation";

const impersonationClient = () =>
	({
		id: "impersonation",
		$InferServerPlugin: {} as ReturnType<typeof impersonation>,
	}) satisfies BetterAuthClientPlugin;

const authClient = createAuthClient({
	plugins: [customSessionClient<typeof authInstance>(), impersonationClient()],
	sessionOptions: { refetchOnWindowFocus: false },
});

type SessionStatus = "loading" | "authenticated" | "unauthenticated";

/** The signed-in session (without Google tokens) and whether it has loaded yet. */
export function useSession() {
	const { data, isPending } = authClient.useSession();
	const status: SessionStatus = isPending
		? "loading"
		: data
			? "authenticated"
			: "unauthenticated";
	return { data: data ?? null, status };
}

/**
 * Starts the Google sign-in flow. `forceConsent` makes Google show the consent
 * screen again, which re-grants any scope the user previously declined.
 */
export function signInWithGoogle(
	options: { callbackUrl?: string; forceConsent?: boolean } = {},
) {
	return authClient.signIn.social({
		provider: "google",
		callbackURL: options.callbackUrl ?? "/",
		errorCallbackURL: "/auth/error",
		additionalParams: options.forceConsent ? { prompt: "consent" } : undefined,
	});
}

export function signOut(options: { callbackUrl?: string } = {}) {
	return authClient.signOut({
		fetchOptions: {
			onSuccess: () => {
				window.location.assign(options.callbackUrl ?? "/");
			},
		},
	});
}

/** Starts viewing the app as another user. Throws with the server's message on failure. */
export async function startImpersonating(userId: string) {
	const { error } = await authClient.impersonation.start({ userId });
	if (error) throw new Error(error.message);
}

/** Returns to your own session. Throws with the server's message on failure. */
export async function stopImpersonating() {
	const { error } = await authClient.impersonation.stop();
	if (error) throw new Error(error.message);
}

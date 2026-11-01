import { customSessionClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { authInstance } from "~/server/auth/config";

const authClient = createAuthClient({
	plugins: [customSessionClient<typeof authInstance>()],
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

"use client";

import { Button } from "@ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { authClient } from "~/lib/auth-client";

/** Error codes Better Auth appends to the error page URL. */
const ERROR_MESSAGES: Record<string, string> = {
	unable_to_create_user:
		"Your account does not have access to this application.",
	unable_to_create_session:
		"Your account does not have access to this application.",
	// Google returned an account outside the practice's Workspace domain.
	unable_to_get_user_info:
		"That Google account is not part of the practice. Sign in with your work account.",
	account_not_linked:
		"This Google account could not be matched to your user. Ask an admin for help.",
	access_denied: "Sign-in was cancelled or not allowed.",
	invalid_code: "The sign-in link has expired or already been used.",
	state_mismatch: "The sign-in link has expired or already been used.",
	state_invalid: "The sign-in link has expired or already been used.",
	state_not_found: "The sign-in link has expired or already been used.",
};

/** Errors where signing in again cannot help. */
const NON_RETRYABLE_ERRORS = new Set([
	"unable_to_create_user",
	"unable_to_create_session",
	"account_not_linked",
]);

function AuthError() {
	const params = useSearchParams();
	const router = useRouter();
	const { data: session } = authClient.useSession();
	const error = params.get("error") ?? "";
	const message =
		ERROR_MESSAGES[error] ?? "Something went wrong during sign in.";
	const canRetry = !NON_RETRYABLE_ERRORS.has(error);

	// If we already have a session, leave this page instead of sitting on it.
	useEffect(() => {
		if (session) {
			router.replace("/");
		}
	}, [session, router]);

	return (
		<main className="flex min-h-screen min-w-screen flex-col items-center justify-center gap-6">
			<h1 className="text-center text-2xl font-bold">Sign-in failed</h1>
			<p className="text-muted-foreground">{message}</p>
			{canRetry && (
				<Button
					onClick={() =>
						authClient.signIn.social({ provider: "google", callbackURL: "/" })
					}
					size="lg"
					variant="secondary"
				>
					Try again
				</Button>
			)}
		</main>
	);
}

export default function AuthErrorPage() {
	return (
		<Suspense>
			<AuthError />
		</Suspense>
	);
}

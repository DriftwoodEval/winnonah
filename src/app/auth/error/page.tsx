"use client";

import { Button } from "@ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { signInWithGoogle, useSession } from "~/lib/auth-client";

/** Error codes Better Auth appends to the error page URL. */
const ERROR_MESSAGES: Record<string, string> = {
	unable_to_create_user:
		"Your account does not have access to this application.",
	unable_to_create_session:
		"Your account does not have access to this application.",
	access_denied: "Sign-in was cancelled or not allowed.",
	invalid_code: "The sign-in link has expired or already been used.",
	state_mismatch: "The sign-in link has expired or already been used.",
};

/** Errors where signing in again cannot help. */
const NON_RETRYABLE_ERRORS = new Set([
	"unable_to_create_user",
	"unable_to_create_session",
]);

function AuthError() {
	const params = useSearchParams();
	const router = useRouter();
	const { status } = useSession();
	const error = params.get("error") ?? "";
	const message =
		ERROR_MESSAGES[error] ?? "Something went wrong during sign in.";
	const canRetry = !NON_RETRYABLE_ERRORS.has(error);

	// If we already have a session, leave this page instead of sitting on it.
	useEffect(() => {
		if (status === "authenticated") {
			router.replace("/");
		}
	}, [status, router]);

	return (
		<main className="flex min-h-screen min-w-screen flex-col items-center justify-center gap-6">
			<h1 className="text-center text-2xl font-bold">Sign-in failed</h1>
			<p className="text-muted-foreground">{message}</p>
			{canRetry && (
				<Button
					onClick={() => signInWithGoogle()}
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

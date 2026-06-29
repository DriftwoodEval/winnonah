"use client";

import { Button } from "@ui/button";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense } from "react";

const ERROR_MESSAGES: Record<string, string> = {
	AccessDenied: "Your account does not have access to this application.",
	Configuration: "There is a problem with the server configuration.",
	Verification: "The sign-in link has expired or already been used.",
};

function AuthError() {
	const params = useSearchParams();
	const error = params.get("error") ?? "";
	const message =
		ERROR_MESSAGES[error] ?? "Something went wrong during sign in.";
	const canRetry = error !== "AccessDenied";

	return (
		<main className="flex min-h-screen min-w-screen flex-col items-center justify-center gap-6">
			<h1 className="text-center font-bold text-2xl">Sign-in failed</h1>
			<p className="text-muted-foreground">{message}</p>
			{canRetry && (
				<Button onClick={() => signIn("google")} size="lg" variant="secondary">
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

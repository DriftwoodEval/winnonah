"use client";

import { Button } from "@ui/button";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Suspense } from "react";

function LoginPage() {
	const params = useSearchParams();
	const timedOut = params.get("timeout") === "true";

	return (
		<main className="flex min-h-screen min-w-screen flex-col items-center justify-center gap-6">
			<h1 className="text-center font-bold text-2xl">
				{timedOut ? "Your session has expired" : "Sign in"}
			</h1>
			{timedOut && (
				<p className="text-muted-foreground">
					Please sign in again to continue.
				</p>
			)}
			<Button onClick={() => signIn("google")} size="lg" variant="secondary">
				Sign in with Google
			</Button>
		</main>
	);
}

export default function Login() {
	return (
		<Suspense>
			<LoginPage />
		</Suspense>
	);
}

"use client";

import { Button } from "@ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Suspense, useEffect } from "react";

function LoginPage() {
	const params = useSearchParams();
	const router = useRouter();
	const { status } = useSession();
	const timedOut = params.get("timeout") === "true";
	const callbackUrl = params.get("callbackUrl") || "/";

	// If we already have a session (e.g. we just finished signing back in),
	// leave this page instead of sitting on it.
	useEffect(() => {
		if (status === "authenticated") {
			router.replace(callbackUrl);
		}
	}, [status, callbackUrl, router]);

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
			<Button
				onClick={() => signIn("google", { callbackUrl })}
				size="lg"
				variant="secondary"
			>
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

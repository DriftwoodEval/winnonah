"use client";

import { Button } from "@ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { authClient } from "~/lib/auth-client";
import { toSitePath } from "~/lib/site-path";

function LoginPage() {
	const params = useSearchParams();
	const router = useRouter();
	const { data: session } = authClient.useSession();
	const timedOut = params.get("timeout") === "true";
	const callbackUrl = toSitePath(params.get("callbackUrl"));

	// If we already have a session (e.g. we just finished signing back in),
	// leave this page instead of sitting on it.
	useEffect(() => {
		if (session) {
			router.replace(callbackUrl);
		}
	}, [session, callbackUrl, router]);

	return (
		<main className="flex min-h-screen min-w-screen flex-col items-center justify-center gap-6">
			<h1 className="text-center text-2xl font-bold">
				{timedOut ? "Your session has expired" : "Sign in"}
			</h1>
			{timedOut && (
				<p className="text-muted-foreground">
					Please sign in again to continue.
				</p>
			)}
			<Button
				onClick={() =>
					authClient.signIn.social({
						provider: "google",
						callbackURL: callbackUrl,
					})
				}
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

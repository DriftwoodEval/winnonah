"use client";

import { Button } from "@ui/button";
import { signIn } from "next-auth/react";

export function AuthRejection({
	reason = "unauthenticated",
}: {
	reason?: "unauthenticated" | "unauthorized";
} = {}) {
	const isUnauthorized = reason === "unauthorized";

	return (
		<main className="flex min-h-screen min-w-screen flex-col items-center justify-center gap-6">
			<h1 className="text-center font-bold text-2xl">
				{isUnauthorized
					? "You don't have permission to view this page."
					: "You must be logged in to view this page."}
			</h1>

			{!isUnauthorized && (
				<Button onClick={() => signIn("google")} size="lg" variant="secondary">
					Sign in
				</Button>
			)}
		</main>
	);
}

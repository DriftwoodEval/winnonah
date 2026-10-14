"use client";

import { Button } from "@ui/button";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function RouteError({
	error,
	retry,
}: {
	error: Error & { digest?: string };
	retry: () => void;
}) {
	useEffect(() => {
		console.error(error);
	}, [error]);

	return (
		<div className="flex w-full flex-col items-center justify-center gap-4 p-8 text-center">
			<AlertTriangle className="size-10 text-destructive" />
			<h1 className="font-semibold text-xl">Something went wrong</h1>
			<p className="max-w-md text-muted-foreground text-sm">
				This page hit an unexpected error. Trying again often fixes it. If it
				keeps happening, report an issue and include the reference below.
			</p>
			{error.digest && (
				<p className="font-mono text-muted-foreground text-xs">
					Reference: {error.digest}
				</p>
			)}
			<div className="flex gap-2">
				<Button onClick={retry} type="button">
					Try again
				</Button>
				<Button asChild variant="outline">
					<Link href="/">Go home</Link>
				</Button>
			</div>
		</div>
	);
}

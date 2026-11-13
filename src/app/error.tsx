"use client";

import { Button } from "@ui/button";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getErrorReference } from "~/lib/error-reference";

export default function RouteError({
	error,
}: {
	error: Error & { digest?: string };
}) {
	const [reference] = useState(() => getErrorReference(error));

	useEffect(() => {
		console.error(reference, error);
	}, [error, reference]);

	return (
		<div className="flex w-full flex-col items-center justify-center gap-4 p-8 text-center">
			<AlertTriangle className="size-10 text-destructive" />
			<h1 className="text-xl font-semibold">Something went wrong</h1>
			<p className="max-w-md text-sm text-muted-foreground">
				This page hit an unexpected error. Trying again often fixes it. If it
				keeps happening, report an issue and include the reference below.
			</p>
			<p className="font-mono text-xs text-muted-foreground">
				Reference: {reference}
			</p>
			{!error.digest && (
				<p className="max-w-md font-mono text-xs break-words text-muted-foreground">
					{error.message}
				</p>
			)}
			<div className="flex gap-2">
				<Button onClick={() => window.location.reload()} type="button">
					Try again
				</Button>
				<Button asChild variant="outline">
					<Link href="/">Go home</Link>
				</Button>
			</div>
		</div>
	);
}

"use client";

import { Button } from "@components/ui/button";
import { Bug } from "lucide-react";
import Link from "next/link";
import { env } from "~/env";

export function IssueFormLink() {
	return (
		<Link href={`https://issue.${env.NEXT_PUBLIC_APP_DOMAIN}`} target="_blank">
			<Button
				className="cursor-pointer rounded-full"
				size="icon"
				variant="ghost"
			>
				<Bug />
				<span className="sr-only">Report issue</span>
			</Button>
		</Link>
	);
}

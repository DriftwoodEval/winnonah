"use client";

import { Button } from "@components/ui/button";
import { Bug } from "lucide-react";
import Link from "next/link";

export function IssueFormLink() {
	return (
		<Link href="https://issue.winnonah.xyz" target="_blank">
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

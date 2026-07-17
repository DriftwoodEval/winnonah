"use client";

import { Button } from "@ui/button";
import { Eye, EyeOff } from "lucide-react";
import { useRedaction } from "./redaction";

/** Toggle to redact PII on the current page for screenshots. */
export function RedactionToggle() {
	const { enabled, toggle } = useRedaction();

	return (
		<Button
			className="rounded-full"
			onClick={toggle}
			size="icon"
			variant={enabled ? "default" : "ghost"}
		>
			{enabled ? (
				<EyeOff className="h-[1.2rem] w-[1.2rem]" />
			) : (
				<Eye className="h-[1.2rem] w-[1.2rem]" />
			)}
			<span className="sr-only">Toggle PII redaction</span>
		</Button>
	);
}

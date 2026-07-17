"use client";

import { scrambleText } from "~/lib/scramble-text";
import { useRedaction } from "./redaction";

/** Wraps a piece of PII text so it can be redacted for screenshots. */
export function Redact({ children }: { children: string | null | undefined }) {
	const { enabled, mode } = useRedaction();

	if (!enabled || !children) return <>{children}</>;

	const scrambled = scrambleText(children);

	if (mode === "blur") {
		return <span className="select-none blur-sm">{scrambled}</span>;
	}

	return <>{scrambled}</>;
}

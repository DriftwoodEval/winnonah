"use client";

import { scrambleText } from "~/lib/scramble-text";
import { useDevRedaction } from "./dev-redaction";

/** Wraps a piece of PII text so it can be redacted for dev-mode screenshots. */
export function DevRedact({
	children,
}: {
	children: string | null | undefined;
}) {
	const { enabled, mode } = useDevRedaction();

	if (!enabled || !children) return <>{children}</>;

	const scrambled = scrambleText(children);

	if (mode === "blur") {
		return <span className="select-none blur-sm">{scrambled}</span>;
	}

	return <>{scrambled}</>;
}

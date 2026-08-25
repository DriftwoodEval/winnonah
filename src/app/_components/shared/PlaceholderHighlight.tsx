"use client";

import { useMemo } from "react";
import { cn } from "~/lib/utils";

function escapeRegExp(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitOnTokens(text: string, tokens: readonly string[]): string[] {
	if (tokens.length === 0) return [text];
	const pattern = tokens.map(escapeRegExp).join("|");
	return text.split(new RegExp(`(${pattern})`, "g"));
}

const HIGHLIGHT_CLASS = "font-semibold text-primary";

interface HighlightedPreviewProps {
	template: string;
	values: Record<string, string>;
	className?: string;
}

/**
 * Renders `template` with its $PLACEHOLDER tokens substituted (same
 * behavior as substituteReminderPlaceholders), highlighting the inserted
 * values so it's clear which parts of the message are dynamic.
 */
export function HighlightedPreview({
	template,
	values,
	className,
}: HighlightedPreviewProps) {
	const segments = useMemo(
		() => splitOnTokens(template, Object.keys(values)),
		[template, values],
	);

	return (
		<div className={cn("whitespace-pre-wrap", className)}>
			{segments.map((seg, i) =>
				Object.hasOwn(values, seg) ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: segments are derived purely from `template`/`values`, re-split on every change
					<span className={HIGHLIGHT_CLASS} key={`${i}-${seg}`}>
						{values[seg]}
					</span>
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: segments are derived purely from `template`/`values`, re-split on every change
					<span key={`${i}-${seg}`}>{seg}</span>
				),
			)}
		</div>
	);
}

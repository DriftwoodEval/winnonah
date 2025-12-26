"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@ui/avatar";
import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Card, CardContent, CardHeader } from "@ui/card";
import { ScrollArea } from "@ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import type { Change } from "diff";
import { ChevronUp } from "lucide-react";
import React, { useState } from "react";
import { calculateDiff, extractTextFromTipTap } from "~/lib/diff-utils";
import { api } from "~/trpc/react";

const UNCHANGED_THRESHOLD = 200;
const CONTEXT_LENGTH = 50;

const DiffRenderer = ({ diffChanges }: { diffChanges: Change[] }) => {
	const [expanded, setExpanded] = useState(false);
	const elements: React.ReactNode[] = [];

	diffChanges.forEach((part, i) => {
		const isUnchanged = !part.added && !part.removed;
		const value = part.value || "";
		const color = part.added
			? "bg-primary/30 text-primary dark:bg-primary/30 dark:text-primary"
			: part.removed
				? "bg-destructive/30 text-destructive line-through dark:bg-destructive/30 dark:text-destructive"
				: "text-foreground dark:text-foreground";

		if (isUnchanged && value.length > UNCHANGED_THRESHOLD) {
			const isFirst = i === 0;
			const isLast = i === diffChanges.length - 1;

			if (!expanded) {
				const startContext = isLast
					? value.length - CONTEXT_LENGTH
					: CONTEXT_LENGTH;
				const endContext = isFirst
					? value.length - CONTEXT_LENGTH
					: CONTEXT_LENGTH;

				let leadingContext = value.substring(0, startContext);
				let trailingContext = value.substring(value.length - endContext);

				if (isFirst) {
					leadingContext = "";
					trailingContext = value.substring(value.length - CONTEXT_LENGTH);
				} else if (isLast) {
					leadingContext = value.substring(0, CONTEXT_LENGTH);
					trailingContext = "";
				}

				// Calculate the number of characters hidden
				const hiddenLength =
					value.length - leadingContext.length - trailingContext.length;

				elements.push(
					<React.Fragment key={`${value}-truncated`}>
						{leadingContext && (
							<span
								className={`${color} wrap-break-word whitespace-pre-wrap rounded px-0.5`}
							>
								{leadingContext}
							</span>
						)}

						{/* Ellipsis/Expand Control */}
						<button
							className="inline-flex cursor-pointer items-center px-2 text-muted-foreground text-sm"
							key={`ellipsis-${value}`}
							onClick={() => setExpanded(true)}
							title={`Click to show ${hiddenLength} unchanged characters`}
							type="button"
						>
							<div className="text-muted-foreground/50">...</div>
							<span className="underline">
								[Show {hiddenLength} unchanged chars]
							</span>
							<div className="text-muted-foreground/50">...</div>
						</button>

						{/* Trailing Context (if applicable) */}
						{trailingContext && (
							<span
								className={`${color} wrap-break-word whitespace-pre-wrap rounded px-0.5`}
							>
								{trailingContext}
							</span>
						)}
					</React.Fragment>,
				);
			} else {
				// Expanded: Show full text
				elements.push(
					<span
						className={`${color} wrap-break-word whitespace-pre-wrap rounded px-0.5`}
						key={`${value}`}
					>
						{value}
					</span>,
				);
			}
		} else {
			// Show full text for short unchanged parts or all changed parts
			elements.push(
				<span
					className={`${color} wrap-break-word whitespace-pre-wrap rounded px-0.5`}
					key={`${value}`}
				>
					{value}
				</span>,
			);
		}
	});

	if (expanded) {
		elements.push(
			<div className="w-full pt-2 text-center" key="collapse-control">
				<Button
					className="inline-flex cursor-pointer items-center gap-1 text-xs"
					onClick={() => setExpanded(false)}
					size="sm"
					variant="link"
				>
					<ChevronUp className="h-3 w-3" /> Collapse Unchanged Text
				</Button>
			</div>,
		);
	} else if (
		elements.length > 0 &&
		diffChanges.some(
			(p) =>
				!p.added &&
				!p.removed &&
				p.value &&
				p.value.length > UNCHANGED_THRESHOLD,
		)
	) {
	}

	return <>{elements}</>;
};

export function NoteHistory({ noteId }: { noteId: number }) {
	const { data: history, isLoading } = api.notes.getHistory.useQuery({
		noteId,
	});

	if (isLoading)
		return (
			<div className="text-muted-foreground text-sm">Loading history...</div>
		);

	const versionCards = history
		?.map((version, index) => {
			const previousVersion = history[index + 1];

			// If this is the oldest history item and it's not the current version (meaning we have nothing to compare it to),
			// we can skip it, but we keep the current version to show the latest state.
			if (!previousVersion && index !== history.length - 1) return null;

			const currentTitleText = version.title || "";
			const previousTitleText = previousVersion
				? previousVersion.title || ""
				: "";

			const titleDiffChanges = calculateDiff(
				previousTitleText,
				currentTitleText,
			);
			const hasTitleChanges = titleDiffChanges.some(
				(p) => p.added || p.removed,
			);

			const currentContentText = extractTextFromTipTap(version.content);
			const previousContentText = previousVersion
				? extractTextFromTipTap(previousVersion.content)
				: "";

			const contentDiffChanges = calculateDiff(
				previousContentText,
				currentContentText,
			);
			const hasContentChanges = contentDiffChanges.some(
				(p) => p.added || p.removed,
			);

			const isCurrent = "isCurrent" in version;

			if (!hasTitleChanges && !hasContentChanges) {
				return null;
			}

			const userName = version.updatedByName || version.updatedBy || "Unknown";

			return (
				<Card key={version.id}>
					<CardHeader className="pb-2">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Avatar className="h-6 w-6">
									{version.updatedByImage ? (
										<AvatarImage alt={userName} src={version.updatedByImage} />
									) : null}
									<AvatarFallback className="text-xs">
										{userName.substring(0, 2).toUpperCase()}
									</AvatarFallback>
								</Avatar>
								<div className="flex flex-col">
									<span className="font-medium text-sm">{userName}</span>
									<span className="text-muted-foreground text-xs">
										{version.createdAt &&
											formatDistanceToNow(new Date(version.createdAt), {
												addSuffix: true,
											})}
									</span>
								</div>
							</div>
							{isCurrent && (
								<Badge className="text-xs" variant="outline">
									Current
								</Badge>
							)}
						</div>
					</CardHeader>
					<CardContent className="space-y-3 p-4 pt-0">
						{/* Title Diff Display */}
						{hasTitleChanges && (
							<div className="rounded-md border p-3">
								<h4 className="mb-1 font-semibold text-sm">Title Change:</h4>
								<div className="font-bold text-lg leading-snug">
									<DiffRenderer diffChanges={titleDiffChanges} />
								</div>
							</div>
						)}

						{/* Content Diff Display */}
						{hasContentChanges && (
							<div className="rounded-md bg-muted/30 p-4 font-mono text-sm leading-relaxed">
								<DiffRenderer diffChanges={contentDiffChanges} />
							</div>
						)}
					</CardContent>
				</Card>
			);
		})
		.filter(Boolean); // Filter out null values

	if (!versionCards?.length)
		return (
			<div className="text-muted-foreground text-sm">No history found.</div>
		);

	return (
		<ScrollArea>
			<div className="space-y-4">{versionCards}</div>
		</ScrollArea>
	);
}

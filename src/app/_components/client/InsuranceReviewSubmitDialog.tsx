"use client";

import { ResponsiveDialog } from "@components/shared/ResponsiveDialog";
import { RichTextEditor } from "@components/shared/RichTextEditor";
import type { JSONContent } from "@tiptap/core";
import { Button } from "@ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	buildReviewBlock,
	extractTextFromContent,
	findBlankLineInsertionPoints,
	findDefaultInsertAt,
	mergeNotesContent,
} from "~/lib/insurance-notes-merge";
import type { Client } from "~/lib/models";
import { api } from "~/trpc/react";

interface InsuranceReviewSubmitDialogProps {
	client: Client;
	review: { content: unknown };
	trigger: React.ReactNode;
	pending: boolean;
	onConfirm: (insertAt: number) => void;
}

export function InsuranceReviewSubmitDialog({
	client,
	review,
	trigger,
	pending,
	onConfirm,
}: InsuranceReviewSubmitDialogProps) {
	const [open, setOpen] = useState(false);
	const [selectedInsertAt, setSelectedInsertAt] = useState<number | null>(null);

	const { data: note } = api.notes.getNoteByClientId.useQuery(client.id, {
		enabled: open,
	});

	const existingContent = useMemo<JSONContent>(
		() => note?.contentJson ?? { type: "doc", content: [] },
		[note?.contentJson],
	);
	const existingNodes = existingContent.content ?? [];

	const reviewBlock = useMemo(() => {
		const reviewContent = (review.content as JSONContent) ?? {};
		const reviewText = extractTextFromContent(reviewContent);
		return buildReviewBlock(reviewContent, reviewText);
	}, [review.content]);

	const candidates = useMemo(() => {
		const points = findBlankLineInsertionPoints(existingNodes);
		return points.length > 0 ? points : [existingNodes.length];
	}, [existingNodes]);

	useEffect(() => {
		if (open) {
			setSelectedInsertAt(findDefaultInsertAt(existingNodes));
		}
	}, [open, existingNodes]);

	const insertAt = selectedInsertAt ?? candidates[0] ?? 0;
	const currentIndex = candidates.indexOf(insertAt);

	const preview = useMemo(
		() => mergeNotesContent(existingContent, reviewBlock, insertAt),
		[existingContent, reviewBlock, insertAt],
	);

	const canMoveUp = currentIndex > 0;
	const canMoveDown =
		currentIndex !== -1 && currentIndex < candidates.length - 1;

	return (
		<ResponsiveDialog
			className="max-w-2xl"
			footer={
				<div className="flex w-full items-center justify-between gap-2">
					<div className="flex items-center gap-1">
						<Button
							disabled={!canMoveUp}
							onClick={() => {
								const target = candidates[currentIndex - 1];
								if (target !== undefined) setSelectedInsertAt(target);
							}}
							size="icon"
							variant="outline"
						>
							<ChevronUp className="size-4" />
						</Button>
						<Button
							disabled={!canMoveDown}
							onClick={() => {
								const target = candidates[currentIndex + 1];
								if (target !== undefined) setSelectedInsertAt(target);
							}}
							size="icon"
							variant="outline"
						>
							<ChevronDown className="size-4" />
						</Button>
						<span className="text-muted-foreground text-sm">
							Move insertion point
						</span>
					</div>
					<div className="flex items-center gap-2">
						<Button
							disabled={pending}
							onClick={() => setOpen(false)}
							variant="outline"
						>
							Cancel
						</Button>
						<Button
							disabled={pending}
							onClick={() => {
								onConfirm(insertAt);
								setOpen(false);
							}}
						>
							{pending ? "Submitting..." : "Confirm"}
						</Button>
					</div>
				</div>
			}
			open={open}
			setOpen={setOpen}
			title="Preview: Copy to Main Notes"
			trigger={trigger}
		>
			<RichTextEditor formatBar={false} readonly value={preview} />
		</ResponsiveDialog>
	);
}

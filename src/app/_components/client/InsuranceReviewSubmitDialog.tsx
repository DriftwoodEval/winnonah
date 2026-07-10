"use client";

import { ResponsiveDialog } from "@components/shared/ResponsiveDialog";
import { RichTextEditor } from "@components/shared/RichTextEditor";
import type { JSONContent } from "@tiptap/core";
import { Button } from "@ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
	cloneElement,
	isValidElement,
	useEffect,
	useMemo,
	useState,
} from "react";
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
	const [noteContentJson, setNoteContentJson] = useState<JSONContent | null>(
		null,
	);

	const utils = api.useUtils();

	const existingContent = useMemo<JSONContent>(
		() => noteContentJson ?? { type: "doc", content: [] },
		[noteContentJson],
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

	const handleTriggerClick = (event: React.MouseEvent) => {
		event.preventDefault();
		void utils.notes.getNoteByClientId.fetch(client.id).then((fetchedNote) => {
			const content = (fetchedNote?.contentJson as JSONContent | null) ?? {
				type: "doc",
				content: [],
			};
			setNoteContentJson(content);

			const hasMainNoteContent =
				extractTextFromContent(content).trim().length > 0;
			if (hasMainNoteContent) {
				setOpen(true);
			} else {
				onConfirm(0);
			}
		});
	};

	const clonedTrigger = isValidElement<{
		onClick?: (event: React.MouseEvent) => void;
	}>(trigger)
		? cloneElement(trigger, { onClick: handleTriggerClick })
		: trigger;

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
			trigger={clonedTrigger}
		>
			<RichTextEditor formatBar={false} readonly value={preview} />
		</ResponsiveDialog>
	);
}

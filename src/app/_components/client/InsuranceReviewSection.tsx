"use client";

import { RichTextEditor } from "@components/shared/RichTextEditor";
import type { JSONContent } from "@tiptap/core";
import { Button } from "@ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { debounce } from "es-toolkit/function";
import { isEqual } from "es-toolkit/predicate";
import { History, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import type { Client } from "~/lib/models";
import { hasPermission } from "~/lib/utils";
import { api } from "~/trpc/react";
import { NoteHistory } from "../shared/NoteHistory";
import { ResponsiveDialog } from "../shared/ResponsiveDialog";

interface InsuranceReviewSectionProps {
	client: Client;
}

export function InsuranceReviewSection({
	client,
}: InsuranceReviewSectionProps) {
	const can = useCheckPermission();
	const utils = api.useUtils();
	const canEdit = can("clients:insurance:review");

	const { data: review, isLoading: isLoadingReview } =
		api.insuranceReview.getByClientId.useQuery(client.id, {
			enabled: !!client.id,
		});

	const { data: allUsers } = api.users.getAll.useQuery(
		{ archived: false },
		{ enabled: canEdit },
	);

	const reviewableUsers = useMemo(
		() =>
			(allUsers ?? []).filter(
				(u) =>
					u.permissions &&
					hasPermission(u.permissions, "clients:insurance:review"),
			),
		[allUsers],
	);

	const [localContent, setLocalContent] = useState<JSONContent | string>("");

	// biome-ignore lint/correctness/useExhaustiveDependencies: only sync on server data change
	useEffect(() => {
		if (review?.content && !isEqual(review.content, localContent)) {
			setLocalContent(review.content as JSONContent);
		}
	}, [review?.content]);

	const updateMutation = api.insuranceReview.update.useMutation({
		onError: (error) => {
			toast.error("Failed to save review notes", {
				description: error.message,
			});
		},
	});

	const setClaimMutation = api.insuranceReview.setClaim.useMutation({
		onSuccess: () => {
			utils.insuranceReview.getByClientId.invalidate(client.id);
		},
		onError: (error) => {
			toast.error("Failed to update claim", { description: error.message });
		},
	});

	const submitMutation = api.insuranceReview.submitToNotes.useMutation({
		onSuccess: (result) => {
			if (result.success) {
				toast.success("Review notes submitted to client notes");
				utils.notes.getNoteByClientId.invalidate(client.id);
			} else {
				toast.error("Nothing to submit", { description: result.reason });
			}
		},
		onError: (error) => {
			toast.error("Failed to submit review notes", {
				description: error.message,
			});
		},
	});

	const stateRef = useRef({ updateMutation, client });
	useEffect(() => {
		stateRef.current = { updateMutation, client };
	});

	const debouncedSave = useMemo(
		() =>
			debounce((content: object) => {
				const { updateMutation, client } = stateRef.current;
				updateMutation.mutate({ clientId: client.id, contentJson: content });
			}, 2000),
		[],
	);

	useEffect(() => {
		return () => {
			debouncedSave.flush();
			debouncedSave.cancel();
		};
	}, [debouncedSave]);

	if (isLoadingReview || !review?.enabled) return null;

	const historyTrigger = (
		<Button className="cursor-pointer rounded-full" size="icon" variant="ghost">
			<History />
		</Button>
	);

	return (
		<div className="w-full">
			<div className="mb-3 flex items-center justify-between gap-2">
				<h4 className="font-bold leading-none">Review</h4>

				<div className="flex items-center gap-2">
					<ResponsiveDialog
						className="max-h-[calc(100vh-4rem)] max-w-fit overflow-x-hidden overflow-y-scroll sm:max-w-fit"
						title="Review History"
						trigger={historyTrigger}
					>
						<NoteHistory id={client.id} type="insurance-review" />
					</ResponsiveDialog>

					<Button
						className="cursor-pointer"
						disabled={submitMutation.isPending || !canEdit}
						onClick={() => submitMutation.mutate(client.id)}
						size="sm"
						variant="outline"
					>
						<Send className="mr-1 h-4 w-4" />
						{submitMutation.isPending ? "Copying..." : "Copy to Main Notes"}
					</Button>
				</div>
			</div>

			<div className="space-y-3">
				<RichTextEditor
					formatBar={false}
					key={`insurance-review-${client.id}`}
					onChange={(content) => {
						setLocalContent(content as JSONContent);
						debouncedSave(content);
					}}
					placeholder="Insurance review notes..."
					readonly={!canEdit}
					value={localContent}
				/>

				{canEdit && (
					<div className="flex items-center gap-2">
						<span className="text-muted-foreground text-sm">Whose turn:</span>
						<Select
							disabled={
								setClaimMutation.isPending || reviewableUsers.length === 0
							}
							onValueChange={(email) =>
								setClaimMutation.mutate({
									clientId: client.id,
									userEmail: email,
								})
							}
							value={review?.claimedUserEmail ?? ""}
						>
							<SelectTrigger className="w-[200px]">
								<SelectValue placeholder="Assign reviewer..." />
							</SelectTrigger>
							<SelectContent>
								{reviewableUsers.map((u) => (
									<SelectItem key={u.id} value={u.email ?? ""}>
										{u.name ?? u.email}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}

				{!canEdit && review?.claimedUserEmail && (
					<p className="text-muted-foreground text-sm">
						Whose turn:{" "}
						{reviewableUsers.find((u) => u.email === review.claimedUserEmail)
							?.name ?? review.claimedUserEmail}
					</p>
				)}
			</div>
		</div>
	);
}

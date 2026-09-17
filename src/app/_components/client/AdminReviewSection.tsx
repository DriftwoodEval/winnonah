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
import { formatDistanceToNowStrict } from "date-fns";
import { debounce } from "es-toolkit/function";
import { isEqual } from "es-toolkit/predicate";
import { Clock, History, Send, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import type { Client } from "~/lib/models";
import { hasPermission, isServerUnavailableError } from "~/lib/utils";
import { api } from "~/trpc/react";
import { NoteHistory } from "../shared/NoteHistory";
import { ResponsiveDialog } from "../shared/ResponsiveDialog";
import { AdminReviewClaimHistory } from "./AdminReviewClaimHistory";
import { AdminReviewSubmitDialog } from "./AdminReviewSubmitDialog";

// Autosave runs in the background, so it regularly fires during brief backend
// blips (deploys, health-check flaps) when the proxy serves an HTML error page.
// Retry those transient failures before bothering the user.
const retryOnServerUnavailable = (failureCount: number, error: unknown) =>
	isServerUnavailableError(error) && failureCount < 5;
const retryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 15000);

function describeSaveError(error: { message: string }) {
	return isServerUnavailableError(error)
		? "The server is temporarily unreachable. Your review notes will save automatically once the connection is back. Keep this page open."
		: error.message;
}

interface AdminReviewSectionProps {
	client: Client;
}

export function AdminReviewSection({ client }: AdminReviewSectionProps) {
	const can = useCheckPermission();
	const utils = api.useUtils();
	const canEdit = can("clients:admin:review");

	const { data: review, isLoading: isLoadingReview } =
		api.adminReview.getByClientId.useQuery(client.id, {
			refetchInterval: 60_000,
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
					u.permissions && hasPermission(u.permissions, "clients:admin:review"),
			),
		[allUsers],
	);

	const { data: claimHistory } = api.adminReview.getClaimHistory.useQuery(
		{ clientId: client.id },
		{ enabled: canEdit },
	);
	const latestClaim = claimHistory?.[0];

	const [localContent, setLocalContent] = useState<JSONContent | string>("");

	// biome-ignore lint/correctness/useExhaustiveDependencies: only sync on server data change
	useEffect(() => {
		if (review?.content && !isEqual(review.content, localContent)) {
			setLocalContent(review.content as JSONContent);
		}
	}, [review?.content]);

	const updateMutation = api.adminReview.update.useMutation({
		retry: retryOnServerUnavailable,
		retryDelay,
		onError: (error) => {
			toast.error("Failed to save review notes", {
				description: describeSaveError(error),
				duration: 10000,
			});
		},
	});

	const setClaimMutation = api.adminReview.setClaim.useMutation({
		onSuccess: () => {
			utils.adminReview.getByClientId.invalidate(client.id);
			utils.adminReview.getClaimHistory.invalidate({ clientId: client.id });
		},
		onError: (error) => {
			toast.error("Failed to update claim", { description: error.message });
		},
	});

	const setWaitingMutation = api.adminReview.setWaiting.useMutation({
		onSuccess: () => {
			utils.adminReview.getByClientId.invalidate(client.id);
			utils.adminReview.getAllEnabled.invalidate();
			utils.adminReview.getMyClaimedClients.invalidate();
		},
		onError: (error) => {
			toast.error("Failed to update waiting state", {
				description: error.message,
			});
		},
	});

	const submitMutation = api.adminReview.submitToNotes.useMutation({
		onSuccess: (result) => {
			if (result.success) {
				toast.success("Review notes submitted to client notes");
				utils.notes.getNoteByClientId.invalidate(client.id);
				utils.adminReview.getByClientId.invalidate(client.id);
				utils.adminReview.getMyClaimedClients.invalidate();
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
						className="max-h-[calc(100vh-4rem)] max-w-2xl overflow-x-hidden overflow-y-scroll sm:max-w-2xl"
						title="Review History"
						trigger={historyTrigger}
					>
						<NoteHistory id={client.id} type="admin-review" />
					</ResponsiveDialog>

					<Button
						className="cursor-pointer"
						disabled={!canEdit || setWaitingMutation.isPending}
						onClick={() =>
							setWaitingMutation.mutate({
								clientId: client.id,
								waiting: !review.waiting,
							})
						}
						size="sm"
						variant={review.waiting ? "secondary" : "outline"}
					>
						<Clock className="mr-1 h-4 w-4" />
						{review.waiting ? "Waiting" : "Mark as Waiting"}
					</Button>

					<AdminReviewSubmitDialog
						client={client}
						onConfirm={async (insertAt) => {
							debouncedSave.cancel();
							await updateMutation.mutateAsync({
								clientId: client.id,
								contentJson: localContent,
							});
							submitMutation.mutate({ clientId: client.id, insertAt });
						}}
						pending={submitMutation.isPending || updateMutation.isPending}
						review={{ content: localContent }}
						trigger={
							<Button
								className="cursor-pointer"
								disabled={submitMutation.isPending || !canEdit}
								size="sm"
								variant="outline"
							>
								<Send className="mr-1 h-4 w-4" />
								{submitMutation.isPending ? "Copying..." : "Copy to Main Notes"}
							</Button>
						}
					/>
				</div>
			</div>

			<div className="space-y-3">
				<RichTextEditor
					allowImages
					key={`admin-review-${client.id}`}
					onChange={(content) => {
						setLocalContent(content as JSONContent);
						debouncedSave(content);
					}}
					placeholder={"STOP or GO\n\nAdmin review notes..."}
					readonly={!canEdit}
					value={localContent}
				/>

				{canEdit && (
					<div className="space-y-1">
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
							<ResponsiveDialog
								className="max-h-[calc(100vh-4rem)] max-w-lg overflow-x-hidden overflow-y-scroll sm:max-w-lg"
								title="Assignment History"
								trigger={
									<Button
										className="cursor-pointer rounded-full"
										size="icon"
										variant="ghost"
									>
										<Users />
									</Button>
								}
							>
								<AdminReviewClaimHistory clientId={client.id} />
							</ResponsiveDialog>
						</div>

						{latestClaim && (
							<p className="text-muted-foreground text-xs">
								{latestClaim.setBy === latestClaim.userEmail
									? "Self-assigned"
									: `Assigned by ${latestClaim.setByName || latestClaim.setBy}`}{" "}
								{formatDistanceToNowStrict(new Date(latestClaim.createdAt), {
									addSuffix: true,
								})}
							</p>
						)}
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

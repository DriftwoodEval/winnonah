"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Checkbox } from "@ui/checkbox";
import { Label } from "@ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { Textarea } from "@ui/textarea";
import { EyeOff, Undo2 } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";

/**
 * Per-user "mute" marks for one dashboard list. Dismissed clients
 * are hidden from the list (while `hide` is on) until they leave
 * it, at which point the mark is pruned. Pass `ready: false` until
 * `clientIds` reflects the fully loaded list, so a partial list never prunes.
 */
export function useListDismissals(
	listKey: string,
	clientIds: number[],
	ready = true,
) {
	const utils = api.useUtils();
	const [hide, setHideState] = useState(false);
	const storageKey = `list-dismissals-hide:${listKey}`;
	// Read after mount so server and client render the same first pass.
	useEffect(() => {
		try {
			if (localStorage.getItem(storageKey) === "true") setHideState(true);
		} catch {
			// Storage unavailable: keep the default.
		}
	}, [storageKey]);
	const setHide = (value: boolean) => {
		setHideState(value);
		try {
			localStorage.setItem(storageKey, String(value));
		} catch {
			// Storage unavailable: the choice just won't persist.
		}
	};
	const { data } = api.listDismissals.list.useQuery();
	const onSuccess = () => utils.listDismissals.list.invalidate();
	const onError = (error: { message: string }) =>
		toast.error("Failed to update", { description: error.message });
	const dismissMutation = api.listDismissals.dismiss.useMutation({
		onSuccess,
		onError,
	});
	const restoreMutation = api.listDismissals.restore.useMutation({
		onSuccess,
		onError,
	});
	const prune = api.listDismissals.prune.useMutation({ onSuccess });

	const notes = useMemo(
		() =>
			new Map(
				(data ?? [])
					.filter((d) => d.listKey === listKey)
					.map((d) => [d.clientId, d.note]),
			),
		[data, listKey],
	);

	const idSet = useMemo(() => new Set(clientIds), [clientIds]);
	const hasStale = [...notes.keys()].some((id) => !idSet.has(id));
	const { mutate: pruneMutate, isPending: pruning } = prune;
	useEffect(() => {
		if (ready && hasStale && !pruning) {
			pruneMutate({ listKey, currentClientIds: [...idSet] });
		}
	}, [ready, hasStale, pruning, listKey, idSet, pruneMutate]);

	const count = clientIds.filter((id) => notes.has(id)).length;

	return {
		hide,
		setHide,
		count,
		isDismissed: (clientId: number) => notes.has(clientId),
		noteFor: (clientId: number) => notes.get(clientId) ?? null,
		/** Drops dismissed clients when `hide` is on. */
		filterVisible: <T,>(items: T[], getId: (item: T) => number) =>
			hide ? items.filter((item) => !notes.has(getId(item))) : items,
		dismiss: (clientId: number, note?: string) =>
			dismissMutation.mutate({ listKey, clientId, note }),
		restore: (clientId: number) =>
			restoreMutation.mutate({ listKey, clientId }),
		isPending: dismissMutation.isPending || restoreMutation.isPending,
	};
}

export type ListDismissals = ReturnType<typeof useListDismissals>;

/** Checkbox that toggles hiding dismissed clients. Renders nothing if none. */
export function HideDismissedToggle({
	dismissals,
}: {
	dismissals: ListDismissals;
}) {
	const id = useId();
	if (dismissals.count === 0) return null;

	return (
		<div className="mb-2 flex items-center gap-2">
			<Checkbox
				checked={dismissals.hide}
				id={id}
				onCheckedChange={(checked) => dismissals.setHide(checked === true)}
			/>
			<Label className="font-normal" htmlFor={id}>
				Hide muted ({dismissals.count})
			</Label>
		</div>
	);
}

/** Badge showing a client is marked not-my-problem, with the note if any. */
export function DismissedBadge({ note }: { note: string | null }) {
	return (
		<Badge className="max-w-60" size="sm" variant="secondary">
			<span className="truncate">Muted{note ? `: ${note}` : ""}</span>
		</Badge>
	);
}

/** "Mute" button with an optional note, or "Unmute" if muted. */
export function DismissButton({
	clientId,
	dismissals,
}: {
	clientId: number;
	dismissals: ListDismissals;
}) {
	const [open, setOpen] = useState(false);
	const [note, setNote] = useState("");

	if (dismissals.isDismissed(clientId)) {
		return (
			<Button
				className="shrink-0"
				disabled={dismissals.isPending}
				onClick={() => dismissals.restore(clientId)}
				size="icon-sm"
				title="Unmute"
				variant="ghost"
			>
				<Undo2 className="h-4 w-4" />
			</Button>
		);
	}

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					className="shrink-0"
					size="icon-sm"
					title="Mute"
					variant="ghost"
				>
					<EyeOff className="h-4 w-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="flex w-72 flex-col gap-2">
				<p className="text-sm">
					Hide this client from this list for you until they move.
				</p>
				<Textarea
					maxLength={500}
					onChange={(e) => setNote(e.target.value)}
					placeholder="Note (optional)"
					rows={2}
					value={note}
				/>
				<Button
					disabled={dismissals.isPending}
					onClick={() => {
						dismissals.dismiss(clientId, note);
						setNote("");
						setOpen(false);
					}}
					size="sm"
				>
					Mute
				</Button>
			</PopoverContent>
		</Popover>
	);
}

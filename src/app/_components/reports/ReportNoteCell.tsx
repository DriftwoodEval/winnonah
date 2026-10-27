"use client";

import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { Skeleton } from "@ui/skeleton";
import { History } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "~/app/_components/shared/EmptyState";
import { formatInBusinessTime } from "~/lib/utils";
import { api } from "~/trpc/react";

// Mounted only while the popover is open, so the history loads on demand.
function NoteHistoryList({ reportId }: { reportId: number }) {
	const { data, isLoading } = api.reports.noteHistory.useQuery({
		id: reportId,
	});

	if (isLoading) {
		return (
			<div className="flex flex-col gap-2">
				{(["a", "b"] as const).map((key) => (
					<div
						className="flex flex-col gap-0.5 border-b pb-2 last:border-0"
						key={key}
					>
						<Skeleton className="h-4 w-40" />
						<Skeleton className="h-6 w-full" />
					</div>
				))}
			</div>
		);
	}
	if (!data?.length) {
		return <EmptyState compact title="No changes yet." />;
	}
	return (
		<ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
			{data.map((entry) => (
				<li
					className="flex flex-col gap-0.5 border-b pb-2 last:border-0"
					key={entry.id}
				>
					<span className="text-xs text-muted-foreground">
						{formatInBusinessTime(entry.createdAt, "MMM d, yyyy h:mm a")}
						{" · "}
						{entry.updatedByName ?? entry.updatedBy ?? "Unknown"}
					</span>
					{entry.note ? (
						<span className="break-words whitespace-pre-wrap">
							{entry.note}
						</span>
					) : (
						<span className="text-muted-foreground italic">Cleared</span>
					)}
				</li>
			))}
		</ul>
	);
}

export function ReportNoteCell({
	reportId,
	note,
	canEdit,
}: {
	reportId: number;
	note: string | null;
	canEdit: boolean;
}) {
	const utils = api.useUtils();
	const setNote = api.reports.setNote.useMutation({
		onSuccess: () => {
			void utils.reports.list.invalidate();
			void utils.reports.noteHistory.invalidate({ id: reportId });
		},
		onError: (e) => toast.error("Failed", { description: e.message }),
	});

	return (
		<div className="flex items-center gap-1">
			{canEdit ? (
				<Input
					className="h-8 w-52"
					defaultValue={note ?? ""}
					// Remounts with the saved text whenever the server value changes.
					key={note ?? ""}
					maxLength={500}
					onBlur={(e) => {
						if (e.target.value.trim() !== (note ?? "")) {
							setNote.mutate({ id: reportId, note: e.target.value });
						}
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") e.currentTarget.blur();
						if (e.key === "Escape") {
							e.currentTarget.value = note ?? "";
							e.currentTarget.blur();
						}
					}}
					placeholder="Add a note"
				/>
			) : (
				<span className="max-w-52 text-sm whitespace-normal">
					{note ?? <span className="text-xs text-muted-foreground">-</span>}
				</span>
			)}
			<Popover>
				<PopoverTrigger asChild>
					<Button aria-label="Note history" size="sm" variant="ghost">
						<History className="h-3.5 w-3.5" />
					</Button>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-80">
					<NoteHistoryList reportId={reportId} />
				</PopoverContent>
			</Popover>
		</div>
	);
}

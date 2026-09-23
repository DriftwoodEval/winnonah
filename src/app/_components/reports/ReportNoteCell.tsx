"use client";

import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { History } from "lucide-react";
import { toast } from "sonner";
import { formatInBusinessTime } from "~/lib/utils";
import { api } from "~/trpc/react";

// Mounted only while the popover is open, so the history loads on demand.
function NoteHistoryList({ reportId }: { reportId: number }) {
	const { data, isLoading } = api.reports.noteHistory.useQuery({
		id: reportId,
	});

	if (isLoading) {
		return <p className="text-muted-foreground">Loading...</p>;
	}
	if (!data?.length) {
		return <p className="text-muted-foreground">No changes yet.</p>;
	}
	return (
		<ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
			{data.map((entry) => (
				<li
					className="flex flex-col gap-0.5 border-b pb-2 last:border-0"
					key={entry.id}
				>
					<span className="text-muted-foreground text-xs">
						{formatInBusinessTime(entry.createdAt, "MMM d, yyyy h:mm a")}
						{" · "}
						{entry.updatedByName ?? entry.updatedBy ?? "Unknown"}
					</span>
					{entry.note ? (
						<span className="whitespace-pre-wrap break-words">
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
				<span className="max-w-52 whitespace-normal text-sm">
					{note ?? <span className="text-muted-foreground text-xs">-</span>}
				</span>
			)}
			<Popover>
				<PopoverTrigger
					render={
						<Button aria-label="Note history" size="sm" variant="ghost">
							<History className="h-3.5 w-3.5" />
						</Button>
					}
				/>
				<PopoverContent align="end" className="w-80">
					<NoteHistoryList reportId={reportId} />
				</PopoverContent>
			</Popover>
		</div>
	);
}

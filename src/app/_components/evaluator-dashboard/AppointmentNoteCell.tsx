"use client";

import { ResponsiveDialog } from "@components/shared/ResponsiveDialog";
import { Button } from "@ui/button";
import { Textarea } from "@ui/textarea";
import { History } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { AppointmentNoteHistory } from "./AppointmentNoteHistory";

interface AppointmentNoteCellProps {
	appointmentId: string;
	initialContent: string | null;
	isAdmin: boolean;
}

export function AppointmentNoteCell({
	appointmentId,
	initialContent,
	isAdmin,
}: AppointmentNoteCellProps) {
	const [value, setValue] = useState(initialContent ?? "");
	const [expanded, setExpanded] = useState(false);
	const savedRef = useRef(initialContent ?? "");

	useEffect(() => {
		setValue(initialContent ?? "");
		savedRef.current = initialContent ?? "";
	}, [initialContent]);

	const saveNote = api.evaluatorDashboard.saveNote.useMutation({
		onError: (error) => {
			toast.error("Failed to save note", {
				description: String(error.message),
			});
		},
	});

	function handleBlur() {
		setExpanded(false);
		if (value !== savedRef.current) {
			savedRef.current = value;
			saveNote.mutate({ appointmentId, contentJson: value as never });
		}
	}

	const historyTrigger = (
		<Button
			className="h-6 w-6 shrink-0 rounded-full"
			size="icon"
			variant="ghost"
		>
			<History className="h-3 w-3" />
		</Button>
	);

	return (
		<div className="flex min-w-[200px] items-start gap-1">
			<div className="flex-1">
				{expanded ? (
					<Textarea
						autoFocus
						className="max-h-[2.5rem] min-h-[2.5rem] resize-none transition-all duration-200 focus:min-h-[8rem]"
						onBlur={handleBlur}
						onChange={(e) => setValue(e.target.value)}
						value={value}
					/>
				) : (
					<button
						className="w-full cursor-text rounded-md border border-input bg-background px-3 py-2 text-left text-sm shadow-xs hover:border-ring/50 hover:bg-accent/30"
						onClick={() => setExpanded(true)}
						type="button"
					>
						{value ? (
							<span className="line-clamp-2 text-foreground">{value}</span>
						) : (
							<span className="text-muted-foreground/60">Add a note…</span>
						)}
					</button>
				)}
			</div>
			{isAdmin && (
				<ResponsiveDialog title="Note History" trigger={historyTrigger}>
					<AppointmentNoteHistory appointmentId={appointmentId} />
				</ResponsiveDialog>
			)}
		</div>
	);
}

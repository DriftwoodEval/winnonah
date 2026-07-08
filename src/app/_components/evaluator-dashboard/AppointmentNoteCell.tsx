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
	const savedRef = useRef(initialContent ?? "");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		setValue(initialContent ?? "");
		savedRef.current = initialContent ?? "";
	}, [initialContent]);

	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "0px";
		el.style.height = `${el.scrollHeight}px`;
	});

	const saveNote = api.evaluatorDashboard.saveNote.useMutation({
		onError: (error) => {
			toast.error("Failed to save note", {
				description: String(error.message),
			});
		},
	});

	function handleBlur() {
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
		<div className="flex items-start gap-1">
			<Textarea
				className="min-h-0 resize-none overflow-hidden"
				onBlur={handleBlur}
				onChange={(e) => setValue(e.target.value)}
				placeholder="Add a note…"
				ref={textareaRef}
				rows={1}
				value={value}
			/>
			{isAdmin && (
				<ResponsiveDialog title="Note History" trigger={historyTrigger}>
					<AppointmentNoteHistory appointmentId={appointmentId} />
				</ResponsiveDialog>
			)}
		</div>
	);
}

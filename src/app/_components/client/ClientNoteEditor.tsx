import { RichTextEditor } from "@components/RichTextEditor";
import { Skeleton } from "@components/ui/skeleton";
import { debounce } from "lodash";
import { useEffect, useMemo } from "react";
import { api } from "~/trpc/react";

interface ClientNoteEditorProps {
	clientId: number;
}

export function ClientNoteEditor({ clientId }: ClientNoteEditorProps) {
	const utils = api.useUtils();

	const { data: note, isLoading } = api.notes.getNoteByClientId.useQuery(
		clientId,
		{
			enabled: !!clientId,
		},
	);

	const updateNoteMutation = api.notes.updateNote.useMutation({
		onError: (error) => {
			console.error("Failed to update note:", error);
			// TODO: Implement user-friendly error notification (e.g., toast)
		},
	});

	const createNoteMutation = api.notes.createNote.useMutation({
		onSuccess: () => {
			if (clientId) {
				if (clientId) {
					utils.notes.getNoteByClientId.invalidate(clientId);
				}
			}
		},
		onError: (error) => console.error("Failed to create note:", error),
		// TODO: Implement user-friendly error notification (e.g., toast)
	});

	const debouncedSave = useMemo(
		() =>
			debounce((editorContent: object) => {
				if (!clientId) return;

				if (note?.id) {
					updateNoteMutation.mutate({
						noteId: note.id,
						contentJson: editorContent,
					});
				} else {
					createNoteMutation.mutate({
						clientId,
						contentJson: editorContent,
					});
				}
			}, 2000), // 2-second debounce
		[clientId, note, createNoteMutation, updateNoteMutation],
	);

	useEffect(() => {
		const handleBeforeUnload = () => debouncedSave.flush();
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
			debouncedSave.cancel();
		};
	}, [debouncedSave]);

	if (isLoading) {
		return (
			<div className="flex flex-col gap-2">
				<Skeleton className="h-6 w-48 rounded-md" key="asana-skeleton-header" />
				<Skeleton
					className="h-20 w-full rounded-md"
					key="asana-skeleton-editor"
				/>
			</div>
		);
	}

	return (
		<div className="w-full">
			<h4 className="mb-4 font-bold leading-none">
				<span className="font-bold">Notes</span>
			</h4>
			<RichTextEditor
				onChange={(newContent) => {
					debouncedSave(newContent);
				}}
				placeholder="Start typing client notes..."
				value={note?.contentJson ?? ""}
			/>
		</div>
	);
}

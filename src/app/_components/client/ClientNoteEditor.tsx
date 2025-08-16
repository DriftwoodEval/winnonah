import { RichTextEditor } from "@components/shared/RichTextEditor";
import { Skeleton } from "@ui/skeleton";
import { debounce } from "lodash";
import { useSession } from "next-auth/react";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { logger } from "~/lib/logger";
import { checkRole } from "~/lib/utils";
import { api } from "~/trpc/react";

const log = logger.child({ module: "ClientNoteEditor" });

interface ClientNoteEditorProps {
	clientId: number;
}

export function ClientNoteEditor({ clientId }: ClientNoteEditorProps) {
	const { data: session } = useSession();
	const admin = session ? checkRole(session.user.role, "admin") : false;

	const utils = api.useUtils();

	const { data: note, isLoading } = api.notes.getNoteByClientId.useQuery(
		clientId,
		{
			enabled: !!clientId,
		},
	);

	const updateNoteMutation = api.notes.updateNote.useMutation({
		onError: (error) => {
			log.error(error, "Failed to update note");
			toast.error("Failed to update note", {
				description: String(error.message),
			});
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
		onError: (error) => {
			log.error(error, "Failed to create note");
			toast.error("Failed to add questionnaire", {
				description: String(error.message),
			});
		},
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

	return (
		<div className="w-full">
			<h4 className="mb-4 font-bold leading-none">
				<span className="font-bold">Notes</span>
			</h4>
			{isLoading ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-9 w-sm rounded-md" />
					<Skeleton className="h-20 w-full rounded-md" key="skeleton-editor" />
				</div>
			) : (
				<div>
					<RichTextEditor
						onChange={debouncedSave}
						placeholder="Start typing client notes..."
						readonly={!admin}
						value={note?.contentJson ?? ""}
					/>
				</div>
			)}
		</div>
	);
}

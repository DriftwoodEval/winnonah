import { RichTextEditor } from "@components/shared/RichTextEditor";
import { Input } from "@ui/input";
import { Skeleton } from "@ui/skeleton";
import { debounce } from "lodash";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
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
			refetchInterval: 10000, // 10 seconds
		},
	);

	const [localTitle, setLocalTitle] = useState(note?.title ?? "");

	useEffect(() => {
		if (note?.title) {
			setLocalTitle(note.title);
		}
	}, [note?.title]);

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
				utils.notes.getNoteByClientId.invalidate(clientId);
			}
		},
		onError: (error) => {
			log.error(error, "Failed to create note");
			toast.error("Failed to add questionnaire", {
				description: String(error.message),
			});
		},
	});

	const stateRef = useRef({
		note,
		updateNoteMutation,
		createNoteMutation,
		clientId,
	});

	useEffect(() => {
		stateRef.current = {
			note,
			updateNoteMutation,
			createNoteMutation,
			clientId,
		};
	});

	const debouncedSaveTitle = useMemo(
		() =>
			debounce((newTitle: string) => {
				const { note, updateNoteMutation, createNoteMutation, clientId } =
					stateRef.current;
				if (!clientId) return;

				if (note?.id) {
					updateNoteMutation.mutate({
						noteId: note.id,
						title: newTitle,
					});
				} else {
					createNoteMutation.mutate({
						clientId,
						title: newTitle,
					});
				}
			}, 1000),
		[],
	);

	const debouncedSaveContent = useMemo(
		() =>
			debounce((editorContent: object) => {
				const { note, updateNoteMutation, createNoteMutation, clientId } =
					stateRef.current;
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
			}, 2000),
		[],
	);

	useEffect(() => {
		const handleBeforeUnload = () => {
			debouncedSaveContent.flush();
			debouncedSaveTitle.flush();
		};
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
			debouncedSaveContent.cancel();
			debouncedSaveTitle.cancel();
		};
	}, [debouncedSaveContent, debouncedSaveTitle]);

	return (
		<div className="w-full">
			<h4 className="mb-4 font-bold leading-none">
				<span className="font-bold">Notes</span>
			</h4>
			{isLoading ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-9 w-full rounded-md" />
					<Skeleton className="h-9 w-sm rounded-md" />
					<Skeleton className="h-20 w-full rounded-md" key="skeleton-editor" />
				</div>
			) : (
				<div>
					<Input
						className="mb-3 text-xl disabled:opacity-100 md:text-xl"
						disabled={!admin}
						name="title"
						onChange={(e) => {
							if (!admin) return;
							setLocalTitle(e.target.value);
							debouncedSaveTitle(e.target.value);
						}}
						value={localTitle}
					/>
					<RichTextEditor
						onChange={debouncedSaveContent}
						placeholder="Start typing client notes..."
						readonly={!admin}
						value={note?.contentJson ?? ""}
					/>
				</div>
			)}
		</div>
	);
}

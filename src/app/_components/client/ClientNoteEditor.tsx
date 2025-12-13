import { RichTextEditor } from "@components/shared/RichTextEditor";
import { Input } from "@ui/input";
import { Skeleton } from "@ui/skeleton";
import { debounce } from "lodash";
import { History } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { logger } from "~/lib/logger";
import { hasPermission } from "~/lib/utils";
import { api } from "~/trpc/react";
import { NoteHistory } from "../shared/NoteHistory";
import { ResponsiveDialog } from "../shared/ResponsiveDialog";
import { Button } from "../ui/button";

const log = logger.child({ module: "ClientNoteEditor" });

interface ClientNoteEditorProps {
	clientId: number;
	readOnly?: boolean;
}

export function ClientNoteEditor({
	clientId,
	readOnly,
}: ClientNoteEditorProps) {
	const { data: session } = useSession();
	const canNote = session
		? hasPermission(session.user.permissions, "clients:notes")
		: false;

	const utils = api.useUtils();

	const { data: note, isLoading } = api.notes.getNoteByClientId.useQuery(
		clientId,
		{
			enabled: !!clientId,
		},
	);

	api.notes.onNoteUpdate.useSubscription(clientId, {
		enabled: !!clientId,
		onData: (updatedNote) => {
			utils.notes.getNoteByClientId.setData(clientId, updatedNote);
		},
	});

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
				duration: 10000,
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
			toast.error("Failed to create note", {
				description: String(error.message),
				duration: 10000,
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

				if (note?.clientId) {
					updateNoteMutation.mutate({
						clientId: note.clientId,
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

				if (note?.clientId) {
					updateNoteMutation.mutate({
						clientId: note.clientId,
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
		return () => {
			// Save on unmount (navigation away from page, browser close, etc.)
			debouncedSaveContent.flush();
			debouncedSaveTitle.flush();
			debouncedSaveContent.cancel();
			debouncedSaveTitle.cancel();
		};
	}, [debouncedSaveContent, debouncedSaveTitle]);

	const historyTrigger = (
		<Button className="cursor-pointer rounded-full" size="icon" variant="ghost">
			<History />
		</Button>
	);

	return (
		<div className="w-full">
			<div className="mb-2 flex items-center justify-between">
				<h4 className="font-bold leading-none">Notes</h4>
				<ResponsiveDialog
					className="max-h-[calc(100vh-4rem)] max-w-fit overflow-x-hidden overflow-y-scroll sm:max-w-fit"
					title="Note History"
					trigger={historyTrigger}
				>
					<NoteHistory noteId={clientId} />
				</ResponsiveDialog>
			</div>
			{isLoading ? (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-9 w-full rounded-md" />
					<Skeleton className="h-9 w-1/4 rounded-md" />
					<Skeleton className="h-20 w-full rounded-md" key="skeleton-editor" />
				</div>
			) : (
				<div>
					<Input
						className="mb-3 text-xl placeholder:text-sm disabled:opacity-100 md:text-xl"
						disabled={!canNote || readOnly}
						name="title"
						onChange={(e) => {
							if (!canNote || readOnly) return;
							setLocalTitle(e.target.value);
							debouncedSaveTitle(e.target.value);
						}}
						placeholder="Add a title..."
						value={localTitle}
					/>
					<RichTextEditor
						onChange={debouncedSaveContent}
						placeholder="Start typing client notes..."
						readonly={!canNote || readOnly}
						value={note?.contentJson ?? ""}
					/>
				</div>
			)}
		</div>
	);
}

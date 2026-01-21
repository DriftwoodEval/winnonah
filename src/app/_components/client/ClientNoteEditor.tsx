import { RichTextEditor } from "@components/shared/RichTextEditor";
import { Button } from "@ui/button";
import { Input } from "@ui/input";
import { Skeleton } from "@ui/skeleton";
import { debounce, isEqual } from "lodash";
import { History } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useCheckPermission } from "~/hooks/use-check-permission";
import { logger } from "~/lib/logger";
import { api } from "~/trpc/react";
import { NoteHistory } from "../shared/NoteHistory";
import { ResponsiveDialog } from "../shared/ResponsiveDialog";

const log = logger.child({ module: "ClientNoteEditor" });

interface ClientNoteEditorProps {
	clientId: number;
	readOnly?: boolean;
}

export function ClientNoteEditor({
	clientId,
	readOnly,
}: ClientNoteEditorProps) {
	const can = useCheckPermission();
	const canNote = can("clients:notes");

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
	const [localContent, setLocalContent] = useState(note?.contentJson ?? "");
	const isTyping = useRef(false);

	useEffect(() => {
		if (note?.title) {
			setLocalTitle(note.title);
		}
	}, [note?.title]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: We exclude localContent from deps to avoid loops, we only care when note updates
	useEffect(() => {
		if (
			note?.contentJson &&
			!isEqual(note.contentJson, localContent) &&
			!isTyping.current
		) {
			setLocalContent(note.contentJson);
		}
	}, [note?.contentJson]);

	const updateNoteMutation = api.notes.updateNote.useMutation({
		onSettled: () => {
			isTyping.current = false;
		},
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
		onSettled: () => {
			isTyping.current = false;
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
		canNote,
	});

	useEffect(() => {
		stateRef.current = {
			note,
			updateNoteMutation,
			createNoteMutation,
			clientId,
			canNote,
		};
	});

	const debouncedSaveTitle = useMemo(
		() =>
			debounce((newTitle: string) => {
				const {
					note,
					updateNoteMutation,
					createNoteMutation,
					clientId,
					canNote,
				} = stateRef.current;
				if (!clientId || !canNote) return;

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
				const {
					note,
					updateNoteMutation,
					createNoteMutation,
					clientId,
					canNote,
				} = stateRef.current;
				if (!clientId || !canNote) return;

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
					<NoteHistory id={clientId} type="note" />
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
						onChange={(content) => {
							isTyping.current = true;
							setLocalContent(content);
							debouncedSaveContent(content);
						}}
						placeholder="Start typing client notes..."
						readonly={!canNote || readOnly}
						value={localContent}
					/>
				</div>
			)}
		</div>
	);
}

import { RichTextEditor } from "@components/RichTextEditor";
import { Skeleton } from "@components/ui/skeleton";
import { debounce } from "lodash";
import { LinkIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import sanitizeHtml from "sanitize-html";
import { api } from "~/trpc/react";

interface AsanaNotesEditorProps {
	asanaId: string;
}

export function AsanaNotesEditor({ asanaId }: AsanaNotesEditorProps) {
	// Data Fetching
	const {
		data: asanaProject,
		isLoading: isLoadingAsanaProject,
		refetch: refetchAsanaProject,
	} = api.asana.getProject.useQuery(asanaId, {
		enabled: !!asanaId && asanaId !== "N/A", // Only run query if asanaId exists and is not "N/A"
	});

	// Derived State and Memoized Values
	const asanaHtmlNotes = useMemo(
		() =>
			asanaProject?.html_notes
				? sanitizeHtml(asanaProject.html_notes).replace(/\n/g, "<br>")
				: null,
		[asanaProject?.html_notes],
	);

	const mutateAsanaProject = api.asana.updateProject.useMutation({
		onSuccess: () => {
			refetchAsanaProject();
		},
		onError: (error) => {
			console.error("Failed to update Asana project:", error);
			// TODO: Implement user-friendly error notification (e.g., toast)
		},
	});

	// Debounced Asana Notes Update
	const asanaTimer = useMemo(
		() =>
			debounce((html_notes: string) => {
				const html = html_notes.trim();
				const wrapInBodyTag =
					!html.startsWith("<body>") && !html.startsWith("<BODY>");
				const htmlWithoutParagraphTags = html
					.replace(/<p[^>]*>/g, "")
					.replace(/<\/p>/g, "\n")
					.replace(/<br[^>]*>/g, "\n");
				const wrappedHtml = wrapInBodyTag
					? `<body>${htmlWithoutParagraphTags}</body>`
					: htmlWithoutParagraphTags;
				mutateAsanaProject.mutate({
					id: asanaId,
					html_notes: wrappedHtml,
				});
			}, 10 * 1000), // 10-second debounce
		[asanaId, mutateAsanaProject],
	);

	useEffect(() => {
		const handleBeforeUnload = () => {
			asanaTimer.flush(); // Ensure any pending updates are sent before unload
		};
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [asanaTimer]);

	if (isLoadingAsanaProject) {
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

	if (!asanaProject) {
		return (
			<div>
				<h4 className="mb-4 font-bold leading-none">Asana Notes</h4>
				<p>No Asana project notes available.</p>
			</div>
		);
	}

	return (
		<div className="w-full">
			<h4 className="mb-4 font-bold leading-none">
				{asanaProject.permalink_url ? (
					<Link
						className="flex items-center gap-2"
						href={asanaProject.permalink_url}
						rel="noopener noreferrer"
						target="_blank"
					>
						Asana Notes <LinkIcon size="1em" />
					</Link>
				) : (
					<span className="font-bold">Asana Notes</span>
				)}
			</h4>
			{typeof asanaHtmlNotes === "string" ? (
				<div>
					<RichTextEditor
						key={asanaHtmlNotes}
						onChange={(value) => {
							asanaTimer(value);
						}}
						value={asanaHtmlNotes}
					/>
				</div>
			) : (
				<div className="flex flex-col gap-2">
					<Skeleton className="h-20 w-full rounded-md" key="asana-skeleton" />
				</div>
			)}
		</div>
	);
}

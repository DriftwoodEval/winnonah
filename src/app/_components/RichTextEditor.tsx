"use client";

import { ToggleGroup, ToggleGroupItem } from "@components/ui/toggle-group";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
	Bold,
	Italic,
	Link as LinkIcon,
	Redo,
	RemoveFormattingIcon,
	Strikethrough,
	Underline as UnderlineIcon,
	Undo,
	Unlink,
} from "lucide-react";
import { cn } from "~/lib/utils";

interface RichTextEditorProps {
	value?: string;
	placeholder?: string;
	onChange?: (content: string) => void;
	className?: string;
}

export function RichTextEditor({
	value = "",
	onChange,
	placeholder = "",
	className,
}: RichTextEditorProps) {
	const editor = useEditor({
		immediatelyRender: false,
		extensions: [StarterKit, Placeholder.configure({ placeholder })],
		content: value,
		onUpdate: ({ editor }) => {
			onChange?.(editor.getHTML());
		},
		editorProps: {
			attributes: {
				class: cn(
					"field-sizing-content block min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:ring-destructive/40",
					"prose prose-sm sm:prose-base max-w-full",
				),
			},
		},
	});

	if (!editor) {
		return null;
	}

	return (
		<div className={className}>
			<div className="mb-3 flex flex-wrap items-center gap-2">
				<ToggleGroup size="sm" type="multiple" variant="outline">
					<ToggleGroupItem
						aria-label="Toggle bold"
						data-state={editor.isActive("bold") ? "on" : "off"}
						disabled={!editor.can().chain().focus().toggleBold().run()}
						onClick={() => editor.chain().focus().toggleBold().run()}
						value="bold"
					>
						<Bold className="size-4" />
					</ToggleGroupItem>
					<ToggleGroupItem
						aria-label="Toggle strikethrough"
						data-state={editor.isActive("strike") ? "on" : "off"}
						disabled={!editor.can().chain().focus().toggleStrike().run()}
						onClick={() => editor.chain().focus().toggleStrike().run()}
						value="strike"
					>
						<Strikethrough className="size-4" />
					</ToggleGroupItem>
					<ToggleGroupItem
						aria-label="Toggle italic"
						data-state={editor.isActive("italic") ? "on" : "off"}
						disabled={!editor.can().chain().focus().toggleItalic().run()}
						onClick={() => editor.chain().focus().toggleItalic().run()}
						value="italic"
					>
						<Italic className="size-4" />
					</ToggleGroupItem>
					<ToggleGroupItem
						aria-label="Toggle underline"
						data-state={editor.isActive("underline") ? "on" : "off"}
						disabled={!editor.can().chain().focus().toggleUnderline().run()}
						onClick={() => editor.chain().focus().toggleUnderline().run()}
						value="underline"
					>
						<UnderlineIcon className="size-4" />
					</ToggleGroupItem>

					<ToggleGroupItem
						aria-label="Clear formatting"
						data-state="off"
						disabled={
							!editor.can().chain().focus().clearNodes().unsetAllMarks().run()
						}
						onClick={() =>
							editor.chain().focus().clearNodes().unsetAllMarks().run()
						}
						value="clear"
					>
						<RemoveFormattingIcon className="size-4" />
					</ToggleGroupItem>
				</ToggleGroup>

				<ToggleGroup size="sm" type="single" variant="outline">
					<ToggleGroupItem
						aria-label="Add link"
						data-state={editor.isActive("link") ? "on" : "off"}
						disabled={
							!editor
								.can()
								.chain()
								.focus()
								.setLink({ href: "https://example.com" })
								.run()
						}
						onClick={() => {
							const url = window.prompt("Enter URL");
							if (url) {
								editor
									.chain()
									.focus()
									.setLink({
										href: url,
										target: "_blank",
										rel: "noopener noreferrer",
									})
									.run();
							}
						}}
						value="link"
					>
						<LinkIcon className="size-4" />
					</ToggleGroupItem>
					<ToggleGroupItem
						aria-label="Add link"
						disabled={!editor.can().chain().focus().unsetLink().run()}
						onClick={() => {
							editor.chain().focus().unsetLink().run();
						}}
						value="link"
					>
						<Unlink className="size-4" />
					</ToggleGroupItem>
				</ToggleGroup>

				<ToggleGroup size="sm" type="single" variant="outline">
					<ToggleGroupItem
						aria-label="Undo"
						disabled={!editor.can().chain().focus().undo().run()}
						onClick={() => editor.chain().focus().undo().run()}
						value="undo"
					>
						<Undo className="size-4" />
					</ToggleGroupItem>
					<ToggleGroupItem
						aria-label="Redo"
						disabled={!editor.can().chain().focus().redo().run()}
						onClick={() => editor.chain().focus().redo().run()}
						value="redo"
					>
						<Redo className="size-4" />
					</ToggleGroupItem>
				</ToggleGroup>
			</div>

			<EditorContent className="rounded-md shadow" editor={editor} />
		</div>
	);
}

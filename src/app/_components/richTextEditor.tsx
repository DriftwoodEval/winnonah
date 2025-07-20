"use client";

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
import {
	ToggleGroup,
	ToggleGroupItem,
} from "~/app/_components/ui/toggle-group";
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
				<ToggleGroup type="multiple" size="sm" variant="outline">
					<ToggleGroupItem
						value="bold"
						aria-label="Toggle bold"
						onClick={() => editor.chain().focus().toggleBold().run()}
						disabled={!editor.can().chain().focus().toggleBold().run()}
						data-state={editor.isActive("bold") ? "on" : "off"}
					>
						<Bold className="size-4" />
					</ToggleGroupItem>
					<ToggleGroupItem
						value="strike"
						aria-label="Toggle strikethrough"
						onClick={() => editor.chain().focus().toggleStrike().run()}
						disabled={!editor.can().chain().focus().toggleStrike().run()}
						data-state={editor.isActive("strike") ? "on" : "off"}
					>
						<Strikethrough className="size-4" />
					</ToggleGroupItem>
					<ToggleGroupItem
						value="italic"
						aria-label="Toggle italic"
						onClick={() => editor.chain().focus().toggleItalic().run()}
						disabled={!editor.can().chain().focus().toggleItalic().run()}
						data-state={editor.isActive("italic") ? "on" : "off"}
					>
						<Italic className="size-4" />
					</ToggleGroupItem>
					<ToggleGroupItem
						value="underline"
						aria-label="Toggle underline"
						onClick={() => editor.chain().focus().toggleUnderline().run()}
						disabled={!editor.can().chain().focus().toggleUnderline().run()}
						data-state={editor.isActive("underline") ? "on" : "off"}
					>
						<UnderlineIcon className="size-4" />
					</ToggleGroupItem>

					<ToggleGroupItem
						value="clear"
						aria-label="Clear formatting"
						onClick={() =>
							editor.chain().focus().clearNodes().unsetAllMarks().run()
						}
						disabled={
							!editor.can().chain().focus().clearNodes().unsetAllMarks().run()
						}
						data-state="off"
					>
						<RemoveFormattingIcon className="size-4" />
					</ToggleGroupItem>
				</ToggleGroup>

				<ToggleGroup type="single" size="sm" variant="outline">
					<ToggleGroupItem
						value="link"
						aria-label="Add link"
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
						disabled={
							!editor
								.can()
								.chain()
								.focus()
								.setLink({ href: "https://example.com" })
								.run()
						}
						data-state={editor.isActive("link") ? "on" : "off"}
					>
						<LinkIcon className="size-4" />
					</ToggleGroupItem>
					<ToggleGroupItem
						value="link"
						aria-label="Add link"
						onClick={() => {
							editor.chain().focus().unsetLink().run();
						}}
						disabled={!editor.can().chain().focus().unsetLink().run()}
					>
						<Unlink className="size-4" />
					</ToggleGroupItem>
				</ToggleGroup>

				<ToggleGroup type="single" size="sm" variant="outline">
					<ToggleGroupItem
						value="undo"
						aria-label="Undo"
						onClick={() => editor.chain().focus().undo().run()}
						disabled={!editor.can().chain().focus().undo().run()}
					>
						<Undo className="size-4" />
					</ToggleGroupItem>
					<ToggleGroupItem
						value="redo"
						aria-label="Redo"
						onClick={() => editor.chain().focus().redo().run()}
						disabled={!editor.can().chain().focus().redo().run()}
					>
						<Redo className="size-4" />
					</ToggleGroupItem>
				</ToggleGroup>
			</div>

			<EditorContent editor={editor} />
		</div>
	);
}

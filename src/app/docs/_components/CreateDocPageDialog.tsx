"use client";

import { Button } from "@ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@ui/dialog";
import { Input } from "@ui/input";
import { Label } from "@ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ui/select";
import { FilePlus2 } from "lucide-react";
import { useState } from "react";

const REPO_URL = "https://github.com/DriftwoodEval/winnonah";

function slugify(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function buildCreateUrl(folder: string, title: string): string {
	const filename = `${slugify(title) || "new-page"}.mdx`;
	const frontmatter = `---\ntitle: ${title}\n---\n\n`;

	return `${REPO_URL}/new/main/src/content/docs/${folder}?filename=${encodeURIComponent(filename)}&value=${encodeURIComponent(frontmatter)}`;
}

export function CreateDocPageDialog({
	folders,
}: {
	folders: { slug: string; title: string }[];
}) {
	const [open, setOpen] = useState(false);
	const [folder, setFolder] = useState(folders[0]?.slug ?? "");
	const [title, setTitle] = useState("");

	const canCreate = folder !== "" && title.trim() !== "";

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<button
					className="mt-4 flex items-center gap-1.5 rounded-md px-3 py-1 text-muted-foreground text-sm hover:bg-accent hover:text-accent-foreground"
					type="button"
				>
					<FilePlus2 className="size-3.5" />
					Create new page
				</button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create New Page</DialogTitle>
					<DialogDescription>
						Choose where the page goes and what it's called. This opens GitHub
						with a new file already started, ready to write and commit.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-1.5">
						<Label htmlFor="doc-folder">Folder</Label>
						<Select onValueChange={setFolder} value={folder}>
							<SelectTrigger className="w-full" id="doc-folder">
								<SelectValue placeholder="Select a folder" />
							</SelectTrigger>
							<SelectContent>
								{folders.map((f) => (
									<SelectItem key={f.slug} value={f.slug}>
										{f.title}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="doc-title">Page title</Label>
						<Input
							id="doc-title"
							onChange={(e) => setTitle(e.target.value)}
							placeholder="e.g. Records Requests"
							value={title}
						/>
					</div>
				</div>
				<DialogFooter>
					<DialogClose asChild>
						<Button type="button" variant="ghost">
							Cancel
						</Button>
					</DialogClose>
					{canCreate ? (
						<DialogClose asChild>
							<Button asChild>
								<a
									href={buildCreateUrl(folder, title)}
									rel="noreferrer"
									target="_blank"
								>
									Create on GitHub
								</a>
							</Button>
						</DialogClose>
					) : (
						<Button disabled type="button">
							Create on GitHub
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

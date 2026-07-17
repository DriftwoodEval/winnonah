"use client";

import { Badge } from "@ui/badge";
import { Button } from "@ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@ui/popover";
import { ChevronDownIcon, ExternalLinkIcon, FileIcon } from "lucide-react";
import { useState } from "react";
import { api } from "~/trpc/react";

interface DriveFile {
	id?: string | null;
	name?: string | null;
	webViewLink?: string | null;
}

/**
 * Best-guess pick among a client's Drive files, in preference order: a PDF
 * with the client's first name, last name, and "report" in its filename; a
 * PDF with just the first and last name; any other file with "report" in
 * its name.
 */
function pickBestFile(
	files: DriveFile[],
	firstName: string,
	lastName: string,
): DriveFile | undefined {
	const contains = (name: string, needle: string) =>
		name.toLowerCase().includes(needle.toLowerCase());
	const isPdf = (name: string) => name.toLowerCase().endsWith(".pdf");
	const hasClientName = (name: string) =>
		contains(name, firstName) && contains(name, lastName);
	const hasReport = (name: string) => contains(name, "report");

	return (
		files.find(
			(f) =>
				isPdf(f.name ?? "") &&
				hasClientName(f.name ?? "") &&
				hasReport(f.name ?? ""),
		) ??
		files.find((f) => isPdf(f.name ?? "") && hasClientName(f.name ?? "")) ??
		files.find((f) => hasReport(f.name ?? ""))
	);
}

export function ClientDriveFiles({
	clientId,
	firstName,
	lastName,
}: {
	clientId: number;
	firstName: string;
	lastName: string;
}) {
	const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
	const { data, isLoading } = api.referralFax.getClientDriveFiles.useQuery({
		clientId,
	});

	if (isLoading) {
		return null;
	}

	const files = data?.files ?? [];
	if (files.length === 0) {
		return (
			<Badge variant="outline">No files found in client's Drive folder</Badge>
		);
	}

	const guessedFile = pickBestFile(files, firstName, lastName);
	const selectedFile =
		files.find((file) => file.id === selectedFileId) ?? guessedFile;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button className="h-auto py-1" size="sm" variant="outline">
					<FileIcon className="h-3 w-3" />
					{selectedFile
						? selectedFile.name
						: `${files.length} file${files.length === 1 ? "" : "s"} in Drive`}
					<ChevronDownIcon className="h-3 w-3 opacity-60" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 p-2">
				<p className="mb-2 px-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
					Files in client's Drive folder
				</p>
				<div className="flex max-h-60 flex-col gap-1 overflow-y-auto">
					{files.map((file) => (
						<a
							className="flex items-center justify-between gap-2 rounded-md p-2 text-sm hover:bg-muted"
							href={file.webViewLink ?? "#"}
							key={file.id}
							onClick={() => setSelectedFileId(file.id ?? null)}
							rel="noopener noreferrer"
							target="_blank"
						>
							<span
								className={
									file.id === selectedFile?.id ? "font-medium" : undefined
								}
							>
								{file.name}
							</span>
							<ExternalLinkIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
						</a>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

"use client";

import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@ui/command";
import MiniSearch from "minisearch";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { DocsSearchEntry } from "../search-index.json/route";

const EXCERPT_RADIUS = 60;

function toPlainText(content: string): string {
	return content
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/[#*`_>[\]]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function getExcerpt(plainText: string, matchedTerms: string[]): string {
	const lowerText = plainText.toLowerCase();
	const matchIndex = matchedTerms
		.map((term) => lowerText.indexOf(term.toLowerCase()))
		.find((i) => i !== -1);

	if (matchIndex === undefined) return plainText.slice(0, EXCERPT_RADIUS * 2);

	const start = Math.max(0, matchIndex - EXCERPT_RADIUS);
	const end = Math.min(plainText.length, matchIndex + EXCERPT_RADIUS);
	const prefix = start > 0 ? "…" : "";
	const suffix = end < plainText.length ? "…" : "";

	return `${prefix}${plainText.slice(start, end)}${suffix}`;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightMatches(
	text: string,
	matchedTerms: string[],
): React.ReactNode {
	if (matchedTerms.length === 0) return text;

	const pattern = new RegExp(
		`((?:${matchedTerms.map(escapeRegExp).join("|")})\\w*)`,
		"gi",
	);
	const parts = text.split(pattern);

	return parts.map((part, i) => {
		const key = i;
		return i % 2 === 1 ? (
			<mark
				className="rounded-sm bg-yellow-300/70 text-foreground dark:bg-yellow-500/40"
				key={key}
			>
				{part}
			</mark>
		) : (
			<Fragment key={key}>{part}</Fragment>
		);
	});
}

export function DocsSearch() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [entries, setEntries] = useState<DocsSearchEntry[]>([]);

	useEffect(() => {
		fetch("/docs/search-index.json")
			.then((res) => res.json())
			.then(setEntries)
			.catch(() => setEntries([]));
	}, []);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const isTyping =
				target?.tagName === "INPUT" ||
				target?.tagName === "TEXTAREA" ||
				target?.isContentEditable;

			if (e.key === "/" && !isTyping) {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	const index = useMemo(() => {
		const mini = new MiniSearch<DocsSearchEntry>({
			idField: "slug",
			fields: ["title", "content"],
			storeFields: ["title", "slug"],
		});
		mini.addAll(entries);
		return mini;
	}, [entries]);

	const entriesBySlug = useMemo(() => {
		return new Map(entries.map((entry) => [entry.slug, entry]));
	}, [entries]);

	const results = useMemo(() => {
		if (!query) return [];
		// fuzzy: 0.2 allows matches within ~20% edit distance, so typos still hit.
		return index
			.search(query, {
				prefix: true,
				fuzzy: 0.2,
				boost: { title: 2 },
			})
			.map((result) => {
				const entry = entriesBySlug.get(result.slug as string);
				const matchedTerms = Object.keys(result.match ?? {});
				const plainText = entry ? toPlainText(entry.content) : "";
				return {
					id: result.id as string,
					slug: result.slug as string,
					title: result.title as string,
					matchedTerms,
					excerpt: getExcerpt(plainText, matchedTerms),
				};
			});
	}, [index, query, entriesBySlug]);

	function goToDoc(slug: string) {
		setOpen(false);
		setQuery("");
		router.push(`/docs/${slug}`);
	}

	return (
		<>
			<button
				className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1.5 text-muted-foreground text-sm shadow-xs"
				onClick={() => setOpen(true)}
				type="button"
			>
				Search docs...
				<kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">
					/
				</kbd>
			</button>
			<CommandDialog
				className="sm:max-w-xl"
				description="Search documentation"
				onOpenChange={setOpen}
				open={open}
				title="Search docs"
			>
				<Command shouldFilter={false}>
					<CommandInput
						onValueChange={setQuery}
						placeholder="Search docs..."
						value={query}
					/>
					<CommandList>
						<CommandEmpty>No results found.</CommandEmpty>
						<CommandGroup>
							{results.map((result) => (
								<CommandItem
									className="w-full flex-col items-start gap-0.5"
									key={result.id}
									onSelect={() => goToDoc(result.slug)}
									value={result.id}
								>
									<span className="font-medium">
										{highlightMatches(result.title, result.matchedTerms)}
									</span>
									{result.excerpt && (
										<span className="w-full text-muted-foreground text-xs">
											{highlightMatches(result.excerpt, result.matchedTerms)}
										</span>
									)}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</CommandDialog>
		</>
	);
}

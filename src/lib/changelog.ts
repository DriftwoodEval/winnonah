import type { ReactNode } from "react";
import * as runtime from "react/jsx-runtime";
import rehypeReact from "rehype-react";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import "server-only";
import { unified } from "unified";
import { type DocHeading, getDocBySlug } from "./docs";
import { formatChangelogDate } from "./formatChangelogDate";

export const CHANGELOG_SLUG = ["changelog"];

export interface ChangelogEntry {
	date: string;
	title: string;
	body: string;
}

const ENTRY_HEADING = /^## (.+)$/gm;
const ENTRY_TITLE = /^(\d{4}-\d{2}-\d{2})\s*-\s*(.+)$/;

export function getChangelogEntries(): ChangelogEntry[] {
	const doc = getDocBySlug(CHANGELOG_SLUG);
	if (!doc) return [];

	const headings = [...doc.content.matchAll(ENTRY_HEADING)];
	const entries: ChangelogEntry[] = [];

	for (let i = 0; i < headings.length; i++) {
		const heading = headings[i];
		if (!heading?.[1]) continue;

		const match = ENTRY_TITLE.exec(heading[1]);
		if (!match?.[1] || !match[2]) continue;

		const start = heading.index + heading[0].length;
		const end = headings[i + 1]?.index ?? doc.content.length;

		entries.push({
			date: match[1],
			title: match[2],
			body: doc.content.slice(start, end).trim(),
		});
	}

	return entries.sort((a, b) => b.date.localeCompare(a.date));
}

export function getChangelogHeadings(): DocHeading[] {
	return getChangelogEntries().map((entry) => ({
		id: entry.date,
		text: `${formatChangelogDate(entry.date)} - ${entry.title}`,
		depth: 2,
	}));
}

export function getUnseenChangelogEntries(
	lastSeen: string | null,
): ChangelogEntry[] {
	const entries = getChangelogEntries();
	if (!lastSeen) return entries;
	return entries.filter((entry) => entry.date > lastSeen);
}

export function renderChangelogBody(body: string): ReactNode {
	const result = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkRehype)
		.use(rehypeReact, {
			Fragment: runtime.Fragment,
			jsx: runtime.jsx,
			jsxs: runtime.jsxs,
		})
		.processSync(body);

	return result.result;
}

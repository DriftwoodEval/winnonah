import { createHash } from "node:crypto";
import type { ReactNode } from "react";
import * as runtime from "react/jsx-runtime";
import rehypeReact from "rehype-react";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import "server-only";
import { unified } from "unified";
import { type DocHeading, getDocBySlug } from "./docs";
import { formatChangelogDate } from "./utils.client";

export const CHANGELOG_SLUG = ["changelog"];

export interface ChangelogBullet {
	section: string;
	text: string;
	hash: string;
}

export interface ChangelogEntry {
	date: string;
	body: string;
	bullets: ChangelogBullet[];
}

/**
 * Identifies which bullets of a day's entry have been seen. Entries newer than
 * `date` are unseen in full; entries older than `date` are treated as fully seen.
 * Only the entry on `date` itself is diffed bullet-by-bullet against `bulletHashes`,
 * so bullets added later the same day are still detected as unseen.
 *
 * A legacy pre-bullet-tracking marker (plain "date:hash" string) parses with
 * `bulletHashes: []`, so every bullet on that date is (re-)shown once. That's
 * a one-time repeat rather than silently hiding bullets added after the old
 * marker was set, which would otherwise never surface until the next day.
 */
export interface ChangelogMarker {
	date: string;
	bulletHashes: string[];
}

const ENTRY_HEADING = /^## (.+)$/gm;
const ENTRY_DATE = /^(\d{4}-\d{2}-\d{2})$/;
const GROUP_LABEL = /^\*\*(.+)\*\*$/;

function hashBullet(section: string, text: string): string {
	return createHash("sha256")
		.update(`${section}\n${text}`)
		.digest("hex")
		.slice(0, 16);
}

function parseBullets(body: string): ChangelogBullet[] {
	const bullets: ChangelogBullet[] = [];
	let section = "";

	for (const line of body.split("\n")) {
		const trimmed = line.trim();
		const labelMatch = GROUP_LABEL.exec(trimmed);
		if (labelMatch?.[1]) {
			section = labelMatch[1];
			continue;
		}
		if (trimmed.startsWith("- ")) {
			const text = trimmed.slice(2).trim();
			bullets.push({ section, text, hash: hashBullet(section, text) });
		}
	}

	return bullets;
}

function bulletsToBody(bullets: ChangelogBullet[]): string {
	const sections: { section: string; texts: string[] }[] = [];
	for (const bullet of bullets) {
		let group = sections.find((s) => s.section === bullet.section);
		if (!group) {
			group = { section: bullet.section, texts: [] };
			sections.push(group);
		}
		group.texts.push(bullet.text);
	}

	return sections
		.map(
			({ section, texts }) =>
				`**${section}**\n${texts.map((text) => `- ${text}`).join("\n")}`,
		)
		.join("\n\n");
}

export function serializeChangelogMarker(marker: ChangelogMarker): string {
	return JSON.stringify({
		date: marker.date,
		bulletHashes: marker.bulletHashes,
	});
}

export function parseChangelogMarker(
	raw: string | null,
): ChangelogMarker | null {
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw) as {
			date?: unknown;
			bulletHashes?: unknown;
		};
		if (typeof parsed.date === "string" && Array.isArray(parsed.bulletHashes)) {
			return {
				date: parsed.date,
				bulletHashes: parsed.bulletHashes.filter(
					(hash): hash is string => typeof hash === "string",
				),
			};
		}
	} catch {
		// Not JSON, fall through to the legacy "date:hash" format below.
	}

	const [date] = raw.split(":");
	if (!date) return null;
	return { date, bulletHashes: [] };
}

export function getChangelogEntries(): ChangelogEntry[] {
	const doc = getDocBySlug(CHANGELOG_SLUG);
	if (!doc) return [];

	const headings = [...doc.content.matchAll(ENTRY_HEADING)];
	const entries: ChangelogEntry[] = [];

	for (let i = 0; i < headings.length; i++) {
		const heading = headings[i];
		if (!heading?.[1]) continue;

		const match = ENTRY_DATE.exec(heading[1]);
		if (!match?.[1]) continue;

		const start = heading.index + heading[0].length;
		const end = headings[i + 1]?.index ?? doc.content.length;

		const body = doc.content.slice(start, end).trim();

		entries.push({
			date: match[1],
			body,
			bullets: parseBullets(body),
		});
	}

	return entries.sort((a, b) => b.date.localeCompare(a.date));
}

export function getChangelogHeadings(): DocHeading[] {
	return getChangelogEntries().map((entry) => ({
		id: entry.date,
		text: formatChangelogDate(entry.date),
		depth: 2,
	}));
}

export function getUnseenChangelogEntries(
	lastSeen: ChangelogMarker | null,
): ChangelogEntry[] {
	const entries = getChangelogEntries();
	if (!lastSeen) return entries;

	const result: ChangelogEntry[] = [];
	for (const entry of entries) {
		if (entry.date > lastSeen.date) {
			result.push(entry);
			continue;
		}
		if (entry.date < lastSeen.date) break;

		// entry.date === lastSeen.date: diff bullet-by-bullet.
		const newBullets = entry.bullets.filter(
			(bullet) => !lastSeen.bulletHashes.includes(bullet.hash),
		);
		if (newBullets.length === 0) continue;
		result.push({
			...entry,
			body: bulletsToBody(newBullets),
			bullets: newBullets,
		});
	}
	return result;
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

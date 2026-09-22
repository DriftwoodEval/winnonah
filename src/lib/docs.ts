import fs from "node:fs";
import path from "node:path";
import matter from "@11ty/gray-matter";
import remarkFlexibleToc, { type TocItem } from "remark-flexible-toc";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import "server-only";
import { unified } from "unified";

export const DOCS_DIR = path.join(process.cwd(), "src/content/docs");

export interface DocFrontmatter {
	title: string;
	needsCleanup?: boolean;
	notDone?: boolean;
}

export interface DocHeading {
	id: string;
	text: string;
	depth: number;
}

export interface DocFile {
	slug: string[];
	frontmatter: DocFrontmatter;
	content: string;
}

export interface DocNavItem {
	slug: string[];
	title: string;
}

export interface DocNavCategory {
	/** Folder path segments joined with "/", e.g. "procedures/appointments". */
	slug: string;
	title: string;
	position: number;
	standalone?: boolean;
	/** Pages directly in this folder. */
	items: DocNavItem[];
	/** Nested folders, sorted by position then title. */
	subcategories: DocNavCategory[];
}

interface CategoryMeta {
	title?: string;
	position?: number;
	standalone?: boolean;
}

function walkDocsDir(dir: string, baseSlug: string[] = []): string[][] {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const slugs: string[][] = [];

	for (const entry of entries) {
		if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;

		if (entry.isDirectory()) {
			slugs.push(
				...walkDocsDir(path.join(dir, entry.name), [...baseSlug, entry.name]),
			);
		} else if (entry.name.endsWith(".mdx") || entry.name.endsWith(".md")) {
			const name = entry.name.replace(/\.mdx?$/, "");
			slugs.push(name === "index" ? baseSlug : [...baseSlug, name]);
		}
	}

	return slugs;
}

function slugToFilePath(slug: string[]): string | null {
	const relative = slug.length === 0 ? "index" : path.join(...slug);
	for (const ext of [".mdx", ".md"]) {
		const filePath = path.join(DOCS_DIR, relative + ext);
		if (fs.existsSync(filePath)) return filePath;
	}

	if (slug.length > 0) {
		for (const ext of [".mdx", ".md"]) {
			const filePath = path.join(DOCS_DIR, relative, `index${ext}`);
			if (fs.existsSync(filePath)) return filePath;
		}
	}

	return null;
}

function parseHeadings(content: string): DocHeading[] {
	const toc: TocItem[] = [];
	const processor = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkFlexibleToc, { tocRef: toc });

	processor.runSync(processor.parse(content));

	return toc.map((item) => ({
		id: item.href.slice(1),
		text: item.value,
		depth: item.depth,
	}));
}

function getCategoryMeta(folderPath: string): CategoryMeta {
	const metaPath = path.join(folderPath, "_category.json");
	if (!fs.existsSync(metaPath)) return {};

	try {
		return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as CategoryMeta;
	} catch {
		return {};
	}
}

function titleCase(slug: string): string {
	return slug
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function sortByPosition<T extends { position: number; title: string }>(
	items: T[],
): T[] {
	return [...items].sort((a, b) => {
		if (a.position !== b.position) return a.position - b.position;
		return a.title.localeCompare(b.title);
	});
}

export function getAllDocSlugs(): string[][] {
	if (!fs.existsSync(DOCS_DIR)) return [];
	return walkDocsDir(DOCS_DIR).filter((slug) => getDocBySlug(slug) !== null);
}

export function getDocBySlug(slug: string[]): DocFile | null {
	const filePath = slugToFilePath(slug);
	if (!filePath) return null;

	const raw = fs.readFileSync(filePath, "utf-8");
	const { data, content } = matter(raw);

	return {
		slug,
		frontmatter: {
			title: data.title ?? slug.at(-1) ?? "Untitled",
			needsCleanup: data.needsCleanup,
			notDone: data.notDone,
		},
		content,
	};
}

export function getDocHeadings(slug: string[]): DocHeading[] {
	const filePath = slugToFilePath(slug);
	if (!filePath) return [];

	const raw = fs.readFileSync(filePath, "utf-8");
	const { content } = matter(raw);

	return parseHeadings(content);
}

export function getDocRelativePath(slug: string[]): string | null {
	const filePath = slugToFilePath(slug);
	if (!filePath) return null;

	return path.relative(DOCS_DIR, filePath).split(path.sep).join("/");
}

function toDocNavItem(slug: string[]): DocNavItem | null {
	const doc = getDocBySlug(slug);
	if (!doc) return null;

	return {
		slug,
		title: doc.frontmatter.title,
	};
}

function listDirectDocSlugs(dir: string, baseSlug: string[]): string[][] {
	const slugs: string[][] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
		if (!entry.isFile()) continue;
		if (!entry.name.endsWith(".mdx") && !entry.name.endsWith(".md")) continue;
		const name = entry.name.replace(/\.mdx?$/, "");
		slugs.push(name === "index" ? baseSlug : [...baseSlug, name]);
	}
	return slugs;
}

function buildCategory(
	folderPath: string,
	slugSegments: string[],
): DocNavCategory | null {
	const meta = getCategoryMeta(folderPath);

	const items = listDirectDocSlugs(folderPath, slugSegments)
		.map(toDocNavItem)
		.filter((item): item is DocNavItem => item !== null)
		.sort((a, b) => a.title.localeCompare(b.title));

	const subcategories = fs
		.readdirSync(folderPath, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				!entry.name.startsWith(".") &&
				!entry.name.startsWith("_"),
		)
		.map((entry) =>
			buildCategory(path.join(folderPath, entry.name), [
				...slugSegments,
				entry.name,
			]),
		)
		.filter((category): category is DocNavCategory => category !== null);

	if (items.length === 0 && subcategories.length === 0) return null;

	return {
		slug: slugSegments.join("/"),
		title: meta.title ?? titleCase(slugSegments.at(-1) ?? ""),
		position: meta.position ?? Number.MAX_SAFE_INTEGER,
		standalone: meta.standalone,
		items,
		subcategories: sortByPosition(subcategories),
	};
}

export function getDocsNavTree(): DocNavCategory[] {
	if (!fs.existsSync(DOCS_DIR)) return [];

	const categories = fs
		.readdirSync(DOCS_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
		.map((entry) =>
			buildCategory(path.join(DOCS_DIR, entry.name), [entry.name]),
		)
		.filter((category): category is DocNavCategory => category !== null);

	return sortByPosition(categories);
}

export function getDocsNav(): DocNavItem[] {
	const flatten = (categories: DocNavCategory[]): DocNavItem[] =>
		categories.flatMap((category) => [
			...category.items,
			...flatten(category.subcategories),
		]);
	return flatten(getDocsNavTree());
}

export function resolveDocsAssetPath(segments: string[]): string | null {
	const filePath = path.join(DOCS_DIR, ...segments);

	if (path.relative(DOCS_DIR, filePath).startsWith("..")) return null;
	if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;

	return filePath;
}

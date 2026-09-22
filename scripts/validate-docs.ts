import fs from "node:fs";
import path from "node:path";
import matter from "@11ty/gray-matter";
import GithubSlugger from "github-slugger";

const DOCS_DIR = path.join(process.cwd(), "src/content/docs");

interface DocEntry {
	slug: string[];
	filePath: string;
	title: string;
	content: string;
}

function walkDocsDir(dir: string, baseSlug: string[] = []): DocEntry[] {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const docs: DocEntry[] = [];

	for (const entry of entries) {
		if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;

		const fullPath = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			docs.push(...walkDocsDir(fullPath, [...baseSlug, entry.name]));
			continue;
		}

		if (!entry.name.endsWith(".mdx") && !entry.name.endsWith(".md")) continue;

		const name = entry.name.replace(/\.mdx?$/, "");
		const slug = name === "index" ? baseSlug : [...baseSlug, name];
		const raw = fs.readFileSync(fullPath, "utf-8");
		const { data, content } = matter(raw);

		docs.push({
			slug,
			filePath: fullPath,
			title: typeof data.title === "string" ? data.title : "",
			content,
		});
	}

	return docs;
}

/**
 * Remove text that shouldn't be scanned for links or images: MDX comments,
 * fenced code blocks, and inline code. A commented-out or example
 * `![](foo.jpg)` isn't a real broken reference.
 */
function stripForScan(content: string): string {
	return content
		.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
		.replace(/```[\s\S]*?```/g, "")
		.replace(/`[^`\n]*`/g, "");
}

/**
 * Collect the heading anchor ids for a page the way the MDX build does:
 * rehype-slug runs github-slugger over each heading's text, disambiguating
 * repeats with a trailing counter.
 */
function headingSlugs(content: string): Set<string> {
	const slugger = new GithubSlugger();
	const slugs = new Set<string>();
	const withoutCode = content
		.replace(/```[\s\S]*?```/g, "")
		.replace(/`[^`\n]*`/g, "");
	for (const m of withoutCode.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
		const text = (m[1] ?? "")
			.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
			.replace(/[*_~]/g, "")
			.trim();
		slugs.add(slugger.slug(text));
	}
	return slugs;
}

const docs = walkDocsDir(DOCS_DIR);
const slugSet = new Set(docs.map((d) => d.slug.join("/")));
const headingsBySlug = new Map(
	docs.map((d) => [d.slug.join("/"), headingSlugs(d.content)]),
);
const errors: string[] = [];
// Broken doc-to-doc links are surfaced in the UI (rendered in the danger color)
// rather than failing the build, so a page can link ahead to one not written
// yet. They're still worth listing here as a nudge.
const warnings: string[] = [];

const titlesByCategory = new Map<string, Map<string, string>>();

for (const doc of docs) {
	const rel = path.relative(DOCS_DIR, doc.filePath);
	const raw = fs.readFileSync(doc.filePath, "utf-8");
	const { data } = matter(raw);

	if (typeof data.title !== "string" || data.title.trim() === "") {
		errors.push(`${rel}: missing or empty "title" in frontmatter`);
	}

	for (const key of ["needsCleanup", "notDone"] as const) {
		if (key in data && typeof data[key] !== "boolean") {
			errors.push(
				`${rel}: frontmatter "${key}" must be a boolean, got ${JSON.stringify(data[key])}`,
			);
		}
	}

	const category = doc.slug[0] ?? "";
	const seen = titlesByCategory.get(category) ?? new Map<string, string>();
	titlesByCategory.set(category, seen);
	if (doc.title) {
		const existing = seen.get(doc.title);
		if (existing) {
			errors.push(
				`${rel}: duplicate title "${doc.title}" in category "${category}" (also used by ${existing})`,
			);
		} else {
			seen.set(doc.title, rel);
		}
	}

	const scannable = stripForScan(doc.content);

	// Doc-to-doc links, e.g. [Records Request Process](/docs/procedures/records-request)
	for (const m of scannable.matchAll(/\]\(\/docs\/([^)\s]*)\)/g)) {
		const [pathPart, anchor] = (m[1] ?? "").split("#");
		const targetSlug = (pathPart ?? "").split("/").filter(Boolean).join("/");
		if (!slugSet.has(targetSlug)) {
			warnings.push(
				`${rel}: link to "/docs/${m[1]}" doesn't resolve to any doc page`,
			);
			continue;
		}
		if (anchor && !headingsBySlug.get(targetSlug)?.has(anchor)) {
			errors.push(
				`${rel}: link to "/docs/${m[1]}" points at a heading that doesn't exist on that page`,
			);
		}
	}

	// Same-page anchor links, e.g. [see below](#where-the-number-comes-from)
	for (const m of scannable.matchAll(/\]\(#([^)\s]+)\)/g)) {
		const anchor = m[1] ?? "";
		if (!headingsBySlug.get(doc.slug.join("/"))?.has(anchor)) {
			errors.push(
				`${rel}: link to "#${anchor}" points at a heading that doesn't exist on this page`,
			);
		}
	}

	// Relative image references, e.g. ![Description](cheddar.jpg)
	for (const m of scannable.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) {
		const src = m[1];
		if (!src || /^([a-z]+:)?\/\//i.test(src) || src.startsWith("/")) continue;
		const imgPath = path.join(path.dirname(doc.filePath), src);
		if (!fs.existsSync(imgPath)) {
			errors.push(
				`${rel}: image "${src}" not found (expected at ${path.relative(DOCS_DIR, imgPath)})`,
			);
		}
	}
}

if (warnings.length > 0) {
	console.warn(`Docs warnings (${warnings.length} broken doc link(s)):`);
	for (const warning of warnings) console.warn(`  - ${warning}`);
}

if (errors.length > 0) {
	console.error(`Docs validation failed (${errors.length} issue(s)):`);
	for (const error of errors) console.error(`  - ${error}`);
	process.exit(1);
}

console.log(`Docs OK: ${docs.length} page(s) validated.`);

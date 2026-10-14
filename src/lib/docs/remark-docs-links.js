import fs from "node:fs";
import path from "node:path";
import { visit } from "unist-util-visit";

const DOCS_DIR = path.join(process.cwd(), "src/content/docs");

/**
 * The set of valid doc slugs ("procedures/outreach", "development/failover", ...)
 * built by walking the docs directory the same way the router does. Rebuilt on
 * every compile so a page created mid-session resolves without a restart.
 */
function collectDocSlugs() {
	const slugs = new Set();
	/**
	 * @param {string} dir
	 * @param {string[]} base
	 */
	const walk = (dir, base) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full, [...base, entry.name]);
				continue;
			}
			if (!entry.name.endsWith(".mdx") && !entry.name.endsWith(".md")) continue;
			const name = entry.name.replace(/\.mdx?$/, "");
			slugs.add((name === "index" ? base : [...base, name]).join("/"));
		}
	};
	if (fs.existsSync(DOCS_DIR)) walk(DOCS_DIR, []);
	return slugs;
}

/**
 * Flags in-app doc links (`/docs/...`) that don't point at a real page. A broken
 * link still renders and still navigates (to a 404), but gets a `broken-doc-link`
 * class so it shows in the danger color instead of the normal link color.
 */
export default function remarkDocsLinks() {
	/**
	 * @param {import("mdast").Root} tree
	 */
	return (tree) => {
		const slugs = collectDocSlugs();

		visit(tree, "link", (node) => {
			if (typeof node.url !== "string" || !node.url.startsWith("/docs/"))
				return;

			const target = node.url.slice("/docs/".length).split(/[#?]/)[0] ?? "";
			if (target.startsWith("images/")) return;

			const slug = target.split("/").filter(Boolean).join("/");
			if (!slug || slugs.has(slug)) return;

			node.data ??= {};
			node.data.hProperties = {
				...node.data.hProperties,
				className: ["broken-doc-link"],
				title: "This link points to a doc page that doesn't exist",
			};
		});
	};
}

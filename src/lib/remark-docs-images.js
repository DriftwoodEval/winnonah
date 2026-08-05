import path from "node:path";
import { visit } from "unist-util-visit";

const DOCS_DIR = path.join(process.cwd(), "src/content/docs");

/**
 * Rewrites relative image paths in docs MDX to the absolute `/docs/images/...`
 * paths served by the docs image route, so authors can write
 * `![alt](cheddar.jpg)` instead of `![alt](/docs/images/development/cheddar.jpg)`.
 */
export default function remarkDocsImages() {
	/**
	 * @param {import("mdast").Root} tree
	 * @param {import("vfile").VFile} file
	 */
	return (tree, file) => {
		const dir = file.dirname ?? path.dirname(file.path ?? "");

		visit(tree, "image", (node) => {
			if (/^([a-z]+:)?\/\//i.test(node.url) || node.url.startsWith("/")) {
				return;
			}

			const absoluteImagePath = path.resolve(dir, node.url);
			const relativeToDocsDir = path.relative(DOCS_DIR, absoluteImagePath);
			node.url = `/docs/images/${relativeToDocsDir.split(path.sep).join("/")}`;
		});
	};
}

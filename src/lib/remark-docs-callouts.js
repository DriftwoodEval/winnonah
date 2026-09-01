import { visit } from "unist-util-visit";
import { resolveCalloutType } from "./callout-types.mjs";

const MARKER = /^\[!(\w+)\][ \t]*(.*)$/;

/**
 * Rewrites GitHub-style alert blockquotes in docs MDX into `<Callout>` elements,
 * so authors can write
 *
 *   > [!TIP]
 *   > Body text.
 *
 * instead of the JSX form. An optional title can follow the marker on the same
 * line: `> [!WARNING] Do not skip this`.
 */
export default function remarkDocsCallouts() {
	/**
	 * @param {import("mdast").Root} tree
	 */
	return (tree) => {
		visit(tree, "blockquote", (node, index, parent) => {
			if (!parent || typeof index !== "number") return;

			const firstChild = node.children[0];
			if (firstChild?.type !== "paragraph") return;

			const markerNode = firstChild.children[0];
			if (markerNode?.type !== "text") return;

			// The marker sits on the first line of the paragraph's leading text
			// node; a soft line break is a literal "\n" within that value.
			const newlineAt = markerNode.value.indexOf("\n");
			const firstLine =
				newlineAt === -1
					? markerNode.value
					: markerNode.value.slice(0, newlineAt);

			const match = MARKER.exec(firstLine.trim());
			if (!match) return;

			const type = resolveCalloutType(match[1] ?? "");
			if (!type) return;

			const title = (match[2] ?? "").trim();

			// Drop the marker line, keeping whatever text followed it.
			const remainder =
				newlineAt === -1 ? "" : markerNode.value.slice(newlineAt + 1);
			if (remainder) {
				markerNode.value = remainder;
			} else {
				firstChild.children.shift();
				if (firstChild.children.length === 0) node.children.shift();
			}

			/** @type {Array<{ type: "mdxJsxAttribute", name: string, value: string }>} */
			const attributes = [
				{ type: "mdxJsxAttribute", name: "type", value: type },
			];
			if (title) {
				attributes.push({
					type: "mdxJsxAttribute",
					name: "title",
					value: title,
				});
			}

			const calloutNode = /** @type {import("mdast").RootContent} */ (
				/** @type {unknown} */ ({
					type: "mdxJsxFlowElement",
					name: "Callout",
					attributes,
					children: node.children,
				})
			);
			parent.children[index] = calloutNode;
		});
	};
}

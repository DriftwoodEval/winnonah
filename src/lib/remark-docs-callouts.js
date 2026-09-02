import { visit } from "unist-util-visit";
import { resolveCalloutType } from "./callout-types.mjs";

// Marker at the very start of a callout blockquote's first line, e.g. `[!TIP]`
// or `[!warning]`. A trailing `~` (`[!TIP]~`) renders the heading in normal
// weight instead of bold. Optional spaces separate the marker from the heading.
const MARKER = /^\[!(\w+)\](~)?[ \t]*/;

/**
 * Rewrites GitHub-style alert blockquotes in docs MDX into `<Callout>` elements,
 * so authors can write
 *
 *   > [!TIP]
 *   > Body text.
 *
 * instead of the JSX form. Text after the marker on the same line becomes the
 * heading and keeps its inline formatting:
 *
 *   > [!WARNING] Do not skip the *precert* check
 *
 * A marker with nothing after it and no body renders just the type's heading.
 */
export default function remarkDocsCallouts() {
	/**
	 * @param {import("mdast").Root} tree
	 */
	return (tree) => {
		visit(tree, "blockquote", (node, index, parent) => {
			if (!parent || typeof index !== "number") return;

			const paragraph = node.children[0];
			if (paragraph?.type !== "paragraph") return;

			const inlines = paragraph.children;
			const firstNode = inlines[0];
			if (firstNode?.type !== "text") return;

			const markerMatch = MARKER.exec(firstNode.value);
			if (!markerMatch) return;

			const type = resolveCalloutType(markerMatch[1] ?? "");
			if (!type) return;

			const plainHeading = markerMatch[2] === "~";

			// Split the inline nodes into what's on the marker's line (the heading)
			// and what follows the first newline (the body). A soft line break is a
			// literal "\n" inside a text node's value; a hard break is a `break`
			// node.
			/** @type {any[]} */
			const headingNodes = [];
			/** @type {any[]} */
			let bodyNodes = [];

			const afterMarker = firstNode.value.slice(markerMatch[0].length);
			const firstNewline = afterMarker.indexOf("\n");
			if (firstNewline !== -1) {
				const headText = afterMarker.slice(0, firstNewline);
				if (headText) headingNodes.push({ type: "text", value: headText });
				bodyNodes = [
					{ type: "text", value: afterMarker.slice(firstNewline + 1) },
					...inlines.slice(1),
				];
			} else {
				if (afterMarker) {
					headingNodes.push({ type: "text", value: afterMarker });
				}
				let i = 1;
				for (; i < inlines.length; i++) {
					const inline = inlines[i];
					if (!inline) continue;
					if (inline.type === "break") {
						bodyNodes = inlines.slice(i + 1);
						break;
					}
					if (inline.type === "text" && inline.value.includes("\n")) {
						const at = inline.value.indexOf("\n");
						const head = inline.value.slice(0, at);
						if (head) headingNodes.push({ type: "text", value: head });
						bodyNodes = [
							{ type: "text", value: inline.value.slice(at + 1) },
							...inlines.slice(i + 1),
						];
						break;
					}
					headingNodes.push(inline);
				}
			}

			// Trim a leading blank text node left on the body by the split.
			if (
				bodyNodes[0]?.type === "text" &&
				bodyNodes[0].value.trim() === "" &&
				bodyNodes.length > 1
			) {
				bodyNodes = bodyNodes.slice(1);
			}
			const hasBody =
				bodyNodes.length > 0 &&
				!(
					bodyNodes.length === 1 &&
					bodyNodes[0]?.type === "text" &&
					bodyNodes[0].value.trim() === ""
				);

			const calloutChildren = [];
			if (headingNodes.length > 0) {
				calloutChildren.push({
					type: "mdxJsxTextElement",
					name: "CalloutTitle",
					attributes: [],
					children: headingNodes,
				});
			}
			if (hasBody) {
				paragraph.children = bodyNodes;
				calloutChildren.push(paragraph, ...node.children.slice(1));
			} else {
				calloutChildren.push(...node.children.slice(1));
			}

			const calloutNode = /** @type {import("mdast").RootContent} */ (
				/** @type {unknown} */ ({
					type: "mdxJsxFlowElement",
					name: "Callout",
					attributes: [
						{ type: "mdxJsxAttribute", name: "type", value: type },
						...(plainHeading
							? [{ type: "mdxJsxAttribute", name: "plain", value: null }]
							: []),
					],
					children: calloutChildren,
				})
			);
			parent.children[index] = calloutNode;
		});
	};
}

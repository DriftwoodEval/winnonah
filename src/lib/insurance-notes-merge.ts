import type { JSONContent } from "@tiptap/core";

export function extractTextFromContent(content: JSONContent): string {
	if (!content) return "";
	if (content.type === "text") return content.text ?? "";
	if (!content.content) return "";
	return content.content.map(extractTextFromContent).join("");
}

function isBlankParagraph(node: JSONContent): boolean {
	return (
		node.type === "paragraph" && (!node.content || node.content.length === 0)
	);
}

/**
 * Runs of consecutive blank paragraphs (e.g. from double-Enter spacing) count as a
 * single logical gap. Each returned index is the splice position right after the
 * run - i.e. immediately before whatever real content follows it.
 */
export function findBlankLineInsertionPoints(nodes: JSONContent[]): number[] {
	const points: number[] = [];
	let i = 0;
	while (i < nodes.length) {
		const node = nodes[i];
		if (node && isBlankParagraph(node)) {
			let j = i;
			while (j < nodes.length) {
				const candidate = nodes[j];
				if (!candidate || !isBlankParagraph(candidate)) break;
				j++;
			}
			points.push(j);
			i = j;
		} else {
			i++;
		}
	}
	return points;
}

export function findDefaultInsertAt(nodes: JSONContent[]): number {
	const gaps = findBlankLineInsertionPoints(nodes);
	if (gaps.length === 0) return nodes.length;

	const [firstGap, secondGap] = gaps;
	if (firstGap === undefined) return nodes.length;

	const scanEnd = secondGap ?? nodes.length;
	const followingText = nodes
		.slice(firstGap, scanEnd)
		.map(extractTextFromContent)
		.join(" ")
		.toLowerCase();

	if (followingText.includes("ifsp")) {
		return secondGap ?? nodes.length;
	}

	return firstGap;
}

export function buildReviewBlock(
	reviewContent: JSONContent,
	reviewText: string,
): JSONContent[] {
	return [
		{ type: "paragraph" },
		{
			type: "paragraph",
			content: [
				{
					type: "text",
					text: "Insurance Review",
					marks: [{ type: "bold" }],
				},
			],
		},
		...(reviewContent.content ?? [
			{
				type: "paragraph",
				content: [{ type: "text", text: reviewText }],
			},
		]),
		{ type: "horizontalRule" },
		{ type: "paragraph" },
	];
}

export function mergeNotesContent(
	existingContent: JSONContent,
	reviewBlock: JSONContent[],
	insertAt: number,
): JSONContent {
	const nodes = existingContent.content ?? [];
	const clamped = Math.min(Math.max(insertAt, 0), nodes.length);

	let before = nodes.slice(0, clamped);
	let after = nodes.slice(clamped);

	while (before.length > 0) {
		const last = before[before.length - 1];
		if (!last || !isBlankParagraph(last)) break;
		before = before.slice(0, -1);
	}

	while (after.length > 0) {
		const first = after[0];
		if (!first || !isBlankParagraph(first)) break;
		after = after.slice(1);
	}

	return {
		type: "doc",
		content: [...before, ...reviewBlock, ...after],
	};
}

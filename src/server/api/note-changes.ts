import type { JSONContent } from "@tiptap/core";
import { diffValues } from "~/server/api/audit";

function nodeText(node: JSONContent): string {
	return node.text ?? (node.content ?? []).map(nodeText).join("");
}

/** The text of each top-level block (paragraph, heading, list, ...), so edits diff by block. */
function blockTexts(doc: JSONContent | null | undefined): string[] {
	return (doc?.content ?? []).map(nodeText).filter((text) => text !== "");
}

/** Only what an edit changed: the title from/to and the blocks added or removed. */
export function noteChanges(
	before: { content: JSONContent | null; title: string | null },
	after: { content: JSONContent | null; title: string | null },
) {
	return {
		title: diffValues(before.title, after.title),
		blocks: diffValues(blockTexts(before.content), blockTexts(after.content)),
	};
}

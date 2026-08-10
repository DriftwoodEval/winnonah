import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
	buildReviewBlock,
	extractTextFromContent,
	findBlankLineInsertionPoints,
	findDefaultInsertAt,
	mergeNotesContent,
} from "./insurance-notes-merge";

function text(value: string): JSONContent {
	return { type: "text", text: value };
}

function paragraph(children?: JSONContent[]): JSONContent {
	return children
		? { type: "paragraph", content: children }
		: { type: "paragraph" };
}

describe("extractTextFromContent", () => {
	it("returns empty string for nullish content", () => {
		expect(extractTextFromContent(null as unknown as JSONContent)).toBe("");
	});

	it("returns the text of a text node", () => {
		expect(extractTextFromContent(text("hello"))).toBe("hello");
	});

	it("returns empty string for a text node with no text field", () => {
		expect(extractTextFromContent({ type: "text" })).toBe("");
	});

	it("concatenates text across nested children", () => {
		const node: JSONContent = {
			type: "paragraph",
			content: [text("hello "), text("world")],
		};
		expect(extractTextFromContent(node)).toBe("hello world");
	});

	it("returns empty string for a node with no content", () => {
		expect(extractTextFromContent(paragraph())).toBe("");
	});
});

describe("findBlankLineInsertionPoints", () => {
	it("returns an empty array when there are no blank paragraphs", () => {
		const nodes = [paragraph([text("a")]), paragraph([text("b")])];
		expect(findBlankLineInsertionPoints(nodes)).toEqual([]);
	});

	it("finds the splice point right after a single blank paragraph", () => {
		const nodes = [paragraph([text("a")]), paragraph(), paragraph([text("b")])];
		expect(findBlankLineInsertionPoints(nodes)).toEqual([2]);
	});

	it("collapses a run of consecutive blank paragraphs into one gap", () => {
		const nodes = [
			paragraph([text("a")]),
			paragraph(),
			paragraph(),
			paragraph(),
			paragraph([text("b")]),
		];
		expect(findBlankLineInsertionPoints(nodes)).toEqual([4]);
	});

	it("treats a trailing blank paragraph as a gap at the end of the list", () => {
		const nodes = [paragraph([text("a")]), paragraph()];
		expect(findBlankLineInsertionPoints(nodes)).toEqual([2]);
	});
});

describe("findDefaultInsertAt", () => {
	it("returns the node count when there are no gaps", () => {
		const nodes = [paragraph([text("a")]), paragraph([text("b")])];
		expect(findDefaultInsertAt(nodes)).toBe(nodes.length);
	});

	it("returns the first gap when the following section has no IFSP mention", () => {
		const nodes = [
			paragraph([text("intro")]),
			paragraph(),
			paragraph([text("some other section")]),
		];
		expect(findDefaultInsertAt(nodes)).toBe(2);
	});

	it("skips past the first gap into the second when IFSP is mentioned before it", () => {
		const nodes = [
			paragraph([text("intro")]),
			paragraph(),
			paragraph([text("this discusses the IFSP goals")]),
			paragraph(),
			paragraph([text("closing")]),
		];
		expect(findDefaultInsertAt(nodes)).toBe(4);
	});

	it("falls back to the node count if IFSP is mentioned but there is no second gap", () => {
		const nodes = [
			paragraph([text("intro")]),
			paragraph(),
			paragraph([text("this discusses the IFSP goals")]),
		];
		expect(findDefaultInsertAt(nodes)).toBe(nodes.length);
	});
});

describe("buildReviewBlock", () => {
	it("uses the review content's nodes when present", () => {
		const reviewContent: JSONContent = {
			type: "doc",
			content: [paragraph([text("custom review text")])],
		};
		const block = buildReviewBlock(reviewContent, "fallback text");

		expect(block[0]).toEqual({ type: "paragraph" });
		expect(block[1]).toMatchObject({
			content: [{ type: "text", text: "Insurance Review" }],
		});
		expect(block[2]).toEqual(paragraph([text("custom review text")]));
		expect(block.at(-2)).toEqual({ type: "horizontalRule" });
		expect(block.at(-1)).toEqual({ type: "paragraph" });
	});

	it("falls back to a plain paragraph built from reviewText when content is empty", () => {
		const reviewContent: JSONContent = { type: "doc" };
		const block = buildReviewBlock(reviewContent, "fallback text");

		expect(block[2]).toEqual(paragraph([text("fallback text")]));
	});
});

describe("mergeNotesContent", () => {
	it("splices the review block in at the given position", () => {
		const existing: JSONContent = {
			type: "doc",
			content: [paragraph([text("a")]), paragraph([text("b")])],
		};
		const reviewBlock = [paragraph([text("review")])];

		const result = mergeNotesContent(existing, reviewBlock, 1);

		expect(result).toEqual({
			type: "doc",
			content: [
				paragraph([text("a")]),
				paragraph([text("review")]),
				paragraph([text("b")]),
			],
		});
	});

	it("clamps the insertion point to the valid range", () => {
		const existing: JSONContent = {
			type: "doc",
			content: [paragraph([text("a")])],
		};
		const reviewBlock = [paragraph([text("review")])];

		expect(mergeNotesContent(existing, reviewBlock, 99)).toEqual({
			type: "doc",
			content: [paragraph([text("a")]), paragraph([text("review")])],
		});
		expect(mergeNotesContent(existing, reviewBlock, -5)).toEqual({
			type: "doc",
			content: [paragraph([text("review")]), paragraph([text("a")])],
		});
	});

	it("trims blank paragraphs adjacent to the insertion point", () => {
		const existing: JSONContent = {
			type: "doc",
			content: [
				paragraph([text("a")]),
				paragraph(),
				paragraph(),
				paragraph([text("b")]),
			],
		};
		const reviewBlock = [paragraph([text("review")])];

		const result = mergeNotesContent(existing, reviewBlock, 2);

		expect(result).toEqual({
			type: "doc",
			content: [
				paragraph([text("a")]),
				paragraph([text("review")]),
				paragraph([text("b")]),
			],
		});
	});

	it("treats missing existing content as an empty node list", () => {
		const existing: JSONContent = { type: "doc" };
		const reviewBlock = [paragraph([text("review")])];

		expect(mergeNotesContent(existing, reviewBlock, 0)).toEqual({
			type: "doc",
			content: [paragraph([text("review")])],
		});
	});
});

import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { calculateDiff, extractTextFromTipTap } from "./diff-utils";

describe("extractTextFromTipTap", () => {
	it("returns empty string for nullish input", () => {
		expect(extractTextFromTipTap(null)).toBe("");
		expect(extractTextFromTipTap(undefined)).toBe("");
	});

	it("returns the string directly when given a string", () => {
		expect(extractTextFromTipTap("hello")).toBe("hello");
	});

	it("returns the text of a text node", () => {
		expect(extractTextFromTipTap({ type: "text", text: "hi" })).toBe("hi");
	});

	it("returns empty string for a text node with no text field", () => {
		expect(extractTextFromTipTap({ type: "text" })).toBe("");
	});

	it("joins nested content and appends a newline after paragraphs", () => {
		const node: JSONContent = {
			type: "paragraph",
			content: [
				{ type: "text", text: "hello " },
				{ type: "text", text: "world" },
			],
		};
		expect(extractTextFromTipTap(node)).toBe("hello world\n");
	});

	it("appends a newline after headings", () => {
		const node: JSONContent = {
			type: "heading",
			content: [{ type: "text", text: "title" }],
		};
		expect(extractTextFromTipTap(node)).toBe("title\n");
	});

	it("does not append a newline for non paragraph/heading node types", () => {
		const node: JSONContent = {
			type: "bulletList",
			content: [{ type: "text", text: "item" }],
		};
		expect(extractTextFromTipTap(node)).toBe("item");
	});

	it("returns empty string for a node with no content array", () => {
		expect(extractTextFromTipTap({ type: "paragraph" })).toBe("");
	});
});

describe("calculateDiff", () => {
	it("returns a single unchanged part for identical text", () => {
		const result = calculateDiff("hello world", "hello world");
		expect(result).toEqual([
			{ count: 2, added: false, removed: false, value: "hello world" },
		]);
	});

	it("detects added and removed words", () => {
		const result = calculateDiff("hello world", "hello there world");
		const added = result.filter((c) => c.added);
		const removed = result.filter((c) => c.removed);
		expect(added.map((c) => c.value.trim())).toContain("there");
		expect(removed).toEqual([]);
	});

	it("detects removed words", () => {
		const result = calculateDiff("hello there world", "hello world");
		const removed = result.filter((c) => c.removed);
		expect(removed.map((c) => c.value.trim())).toContain("there");
	});
});

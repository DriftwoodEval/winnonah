import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { noteChanges } from "./note-changes";

const doc = (...paragraphs: string[]): JSONContent => ({
	type: "doc",
	content: paragraphs.map((text) => ({
		type: "paragraph",
		content: [{ type: "text", text }],
	})),
});

describe("noteChanges", () => {
	it("logs only the added and removed blocks, not the whole note", () => {
		const changes = noteChanges(
			{ content: doc("one", "two"), title: "T" },
			{ content: doc("one", "three"), title: "T" },
		);
		expect(changes.title).toBeUndefined();
		expect(changes.blocks).toEqual({ added: ["three"], removed: ["two"] });
	});

	it("logs a title change as from/to", () => {
		const changes = noteChanges(
			{ content: doc("a"), title: "Old" },
			{ content: doc("a"), title: "New" },
		);
		expect(changes.title).toEqual({ from: "Old", to: "New" });
		expect(changes.blocks).toBeUndefined();
	});
});

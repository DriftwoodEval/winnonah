import { describe, expect, it } from "vitest";
import { fuzzyNameRowMatches, nameSearchWords } from "./name-search";

describe("nameSearchWords", () => {
	it("drops punctuation and empty words", () => {
		expect(nameSearchWords("o'brien,  jo")).toEqual(["o", "brien", "jo"]);
	});
});

describe("fuzzyNameRowMatches", () => {
	it("matches substrings and one-typo words", () => {
		expect(fuzzyNameRowMatches(["smi"], "Jane Smith")).toBe(true);
		expect(fuzzyNameRowMatches(["smyth"], "Jane Smith")).toBe(true);
	});
	it("rejects words more than one edit away", () => {
		expect(fuzzyNameRowMatches(["smooth"], "Jane Smith")).toBe(false);
	});
	it("matches everything for an empty search", () => {
		expect(fuzzyNameRowMatches([], "Jane Smith")).toBe(true);
	});
});

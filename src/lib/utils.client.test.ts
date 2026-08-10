import { describe, expect, it } from "vitest";
import { formatChangelogDate, scrambleText } from "./utils.client";

describe("scrambleText", () => {
	it("preserves the length of the input", () => {
		const input = "Hello, World! 123";
		expect(scrambleText(input).length).toBe(input.length);
	});

	it("leaves whitespace and punctuation in place", () => {
		const input = "Hello, World! 123-456.";
		const result = scrambleText(input);
		for (let i = 0; i < input.length; i++) {
			if (!/[A-Za-z0-9]/.test(input[i] as string)) {
				expect(result[i]).toBe(input[i]);
			}
		}
	});

	it("replaces lowercase letters with lowercase letters", () => {
		const result = scrambleText("abcdefghij");
		expect(result).toMatch(/^[a-z]{10}$/);
	});

	it("replaces uppercase letters with uppercase letters", () => {
		const result = scrambleText("ABCDEFGHIJ");
		expect(result).toMatch(/^[A-Z]{10}$/);
	});

	it("replaces digits with digits", () => {
		const result = scrambleText("0123456789");
		expect(result).toMatch(/^[0-9]{10}$/);
	});

	it("returns an empty string for empty input", () => {
		expect(scrambleText("")).toBe("");
	});
});

describe("formatChangelogDate", () => {
	it("formats an ISO date as a long-form date", () => {
		expect(formatChangelogDate("2026-08-10")).toBe("August 10, 2026");
	});

	it("does not shift the date across a timezone boundary", () => {
		expect(formatChangelogDate("2026-01-01")).toBe("January 1, 2026");
	});
});

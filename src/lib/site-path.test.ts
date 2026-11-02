import { describe, expect, it } from "vitest";
import { toSitePath } from "./site-path";

describe("toSitePath", () => {
	it.each([
		["/clients/directory", "/clients/directory"],
		["/clients/directory?status=all#top", "/clients/directory?status=all#top"],
		["/", "/"],
		// A lone backslash is just a path character on this site.
		["\\evil.example", "/evil.example"],
	])("keeps the same-site path %s", (value, expected) => {
		expect(toSitePath(value)).toBe(expected);
	});

	it.each([
		null,
		undefined,
		"",
		"https://evil.example",
		"//evil.example",
		"/\\evil.example",
		"/%5Cevil.example/..",
		"/\t/evil.example",
		"javascript:alert(1)",
	])("falls back to / for %j", (value) => {
		expect(toSitePath(value)).toBe("/");
	});
});

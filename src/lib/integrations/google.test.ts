import { describe, expect, it, vi } from "vitest";

// google.ts pulls in the env and database modules at import time.
vi.mock("~/env", () => ({ env: {} }));
vi.mock("~/server/db", () => ({ db: {} }));

const { classifyReviewColor } = await import("./google");

describe("classifyReviewColor", () => {
	it("treats #ff0000 as red, omitting the channels that are 0", () => {
		expect(classifyReviewColor({ red: 1 })).toBe("red");
		expect(classifyReviewColor({ red: 1, green: 0, blue: 0 })).toBe("red");
	});

	it("treats #00ff00 as green", () => {
		expect(classifyReviewColor({ green: 1 })).toBe("green");
	});

	it("treats every other color as neither", () => {
		expect(classifyReviewColor({ red: 1, green: 1, blue: 1 })).toBeNull();
		expect(
			classifyReviewColor({ red: 0.957, green: 0.8, blue: 0.8 }),
		).toBeNull();
		expect(classifyReviewColor({ blue: 1 })).toBeNull();
		expect(classifyReviewColor({})).toBeNull();
		expect(classifyReviewColor(null)).toBeNull();
	});
});

import { describe, expect, it } from "vitest";
import {
	CLIENT_COLOR_KEYS,
	formatColorName,
	getHexFromColor,
	isClientColor,
	isSchedulingColor,
	SCHEDULING_COLOR_KEYS,
} from "./colors";

describe("isClientColor", () => {
	it("returns true for known client colors", () => {
		expect(isClientColor("blue")).toBe(true);
	});

	it("returns false for unknown keys", () => {
		expect(isClientColor("not-a-color")).toBe(false);
	});
});

describe("isSchedulingColor", () => {
	it("returns true for known scheduling colors", () => {
		expect(isSchedulingColor("Priority")).toBe(true);
	});

	it("returns false for unknown keys", () => {
		expect(isSchedulingColor("not-a-color")).toBe(false);
	});
});

describe("formatColorName", () => {
	it("capitalizes each hyphen-separated word", () => {
		expect(formatColorName("light-pink")).toBe("Light Pink");
	});

	it("capitalizes a single word", () => {
		expect(formatColorName("gray")).toBe("Gray");
	});
});

describe("getHexFromColor", () => {
	it("resolves client colors", () => {
		expect(getHexFromColor("blue")).toBe("#79abff");
	});

	it("resolves scheduling colors", () => {
		expect(getHexFromColor("Priority")).toBe("#d82000");
	});

	it("has a hex value for every client color key", () => {
		for (const key of CLIENT_COLOR_KEYS) {
			expect(getHexFromColor(key)).toMatch(/^#[0-9a-f]{6}$/);
		}
	});

	it("has a hex value for every scheduling color key", () => {
		for (const key of SCHEDULING_COLOR_KEYS) {
			expect(getHexFromColor(key)).toMatch(/^#[0-9a-f]{6}$/);
		}
	});
});

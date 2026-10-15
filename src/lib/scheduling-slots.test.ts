import { describe, expect, it } from "vitest";
import {
	countOpenSlots,
	freeIntervals,
	slotStarts,
} from "~/lib/scheduling-slots";

const H = 3600000;

describe("freeIntervals", () => {
	it("splits a window around busy ranges", () => {
		expect(
			freeIntervals(
				[{ start: 9 * H, end: 17 * H }],
				[
					{ start: 11 * H, end: 12 * H },
					{ start: 11.5 * H, end: 13 * H },
				],
			),
		).toEqual([
			{ start: 9 * H, end: 11 * H },
			{ start: 13 * H, end: 17 * H },
		]);
	});

	it("returns nothing when busy covers the window", () => {
		expect(
			freeIntervals(
				[{ start: 9 * H, end: 10 * H }],
				[{ start: 8 * H, end: 11 * H }],
			),
		).toEqual([]);
	});
});

describe("countOpenSlots / slotStarts", () => {
	const free = [
		{ start: 9 * H, end: 11 * H },
		{ start: 13 * H, end: 14.5 * H },
	];

	it("counts whole appointments that fit", () => {
		expect(countOpenSlots(free, H)).toBe(3);
		expect(countOpenSlots(free, 2 * H)).toBe(1);
	});

	it("lists starts on the step and respects notBefore", () => {
		expect(slotStarts(free, H, 0.5 * H)).toEqual([
			9 * H,
			9.5 * H,
			10 * H,
			13 * H,
			13.5 * H,
		]);
		expect(slotStarts(free, H, 0.5 * H, 10 * H)).toEqual([
			10 * H,
			13 * H,
			13.5 * H,
		]);
	});
});

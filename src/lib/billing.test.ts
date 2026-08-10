import { describe, expect, it } from "vitest";
import {
	aggregateBillingCodes,
	calculateAdditionalAppointments,
	packCodesIntoAppointments,
	parsePrecertMemo,
} from "./billing";

describe("parsePrecertMemo", () => {
	it("parses multiple 'CODE-N' and 'CODE x N' entries in one memo", () => {
		expect(parsePrecertMemo("96136-1, 96137 x 6")).toEqual([
			{ code: "96136", units: 1 },
			{ code: "96137", units: 6 },
		]);
	});

	it("parses 'CODE (N)' entries", () => {
		expect(parsePrecertMemo("96136 (1)")).toEqual([
			{ code: "96136", units: 1 },
		]);
	});

	it("parses 'N Unit CODE' entries", () => {
		expect(parsePrecertMemo("1 Unit 96130")).toEqual([
			{ code: "96130", units: 1 },
		]);
	});

	it("parses 'N Units CODE' entries", () => {
		expect(parsePrecertMemo("2 Units 96131")).toEqual([
			{ code: "96131", units: 2 },
		]);
	});

	it("returns null when no codes are found", () => {
		expect(parsePrecertMemo("no codes here")).toBeNull();
	});

	it("sums units when the same code appears multiple times", () => {
		expect(parsePrecertMemo("96136-1 and again 96136-2")).toEqual([
			{ code: "96136", units: 3 },
		]);
	});
});

describe("packCodesIntoAppointments", () => {
	it("puts one 96136 and fills the rest of the day with 96137", () => {
		const result = packCodesIntoAppointments(
			[
				{ code: "96136", units: 1 },
				{ code: "96137", units: 5 },
			],
			8,
		);
		expect(result).toEqual([
			{
				codes: [
					{ code: "96136", units: 1 },
					{ code: "96137", units: 5 },
				],
			},
		]);
	});

	it("splits across multiple appointments once the daily cap is hit", () => {
		const result = packCodesIntoAppointments(
			[
				{ code: "96136", units: 2 },
				{ code: "96137", units: 10 },
			],
			4,
		);
		expect(result).toEqual([
			{
				codes: [
					{ code: "96136", units: 1 },
					{ code: "96137", units: 3 },
				],
			},
			{
				codes: [
					{ code: "96136", units: 1 },
					{ code: "96137", units: 3 },
				],
			},
		]);
	});

	it("packs 96130/96131 into their own appointment", () => {
		const result = packCodesIntoAppointments(
			[
				{ code: "96130", units: 1 },
				{ code: "96131", units: 2 },
			],
			3,
		);
		expect(result).toEqual([
			{
				codes: [
					{ code: "96130", units: 1 },
					{ code: "96131", units: 2 },
				],
			},
		]);
	});

	it("packs 30-min and 60-min code groups into separate appointments", () => {
		const result = packCodesIntoAppointments(
			[
				{ code: "96136", units: 1 },
				{ code: "96137", units: 3 },
				{ code: "96130", units: 1 },
				{ code: "96131", units: 2 },
			],
			4,
		);
		expect(result).toEqual([
			{
				codes: [
					{ code: "96136", units: 1 },
					{ code: "96137", units: 3 },
				],
			},
			{
				codes: [
					{ code: "96130", units: 1 },
					{ code: "96131", units: 2 },
				],
			},
		]);
	});

	it("returns an empty list for no codes", () => {
		expect(packCodesIntoAppointments([], 8)).toEqual([]);
	});
});

describe("aggregateBillingCodes", () => {
	it("sums units for the same code across appointments", () => {
		const result = aggregateBillingCodes([
			{ codes: [{ code: "96136", units: 1 }] },
			{
				codes: [
					{ code: "96136", units: 1 },
					{ code: "96137", units: 3 },
				],
			},
		]);
		expect(result).toEqual([
			{ code: "96136", units: 2 },
			{ code: "96137", units: 3 },
		]);
	});

	it("returns an empty list for no appointments", () => {
		expect(aggregateBillingCodes([])).toEqual([]);
	});
});

describe("calculateAdditionalAppointments", () => {
	it("returns no appointments for zero minutes", () => {
		expect(calculateAdditionalAppointments(0, 8)).toEqual([]);
	});

	it("returns no appointments for negative minutes", () => {
		expect(calculateAdditionalAppointments(-10, 8)).toEqual([]);
	});

	it("builds one 60-min and one 30-min appointment for a small block", () => {
		const result = calculateAdditionalAppointments(60, 8);
		expect(result).toEqual([
			{ codes: [{ code: "96136", units: 1 }] },
			{ codes: [{ code: "96130", units: 1 }] },
		]);
	});

	it("scales up appointments for a larger block of minutes", () => {
		const result = calculateAdditionalAppointments(300, 8);
		expect(result).toEqual([
			{
				codes: [
					{ code: "96136", units: 1 },
					{ code: "96137", units: 6 },
				],
			},
			{
				codes: [
					{ code: "96130", units: 1 },
					{ code: "96131", units: 3 },
				],
			},
		]);
	});

	it("respects per-code unit caps", () => {
		const result = calculateAdditionalAppointments(300, 8, {
			max96136: 1,
			max96137: 2,
			max96130: 1,
			max96131: 1,
		});
		expect(result).toEqual([
			{
				codes: [
					{ code: "96136", units: 1 },
					{ code: "96137", units: 2 },
				],
			},
			{
				codes: [
					{ code: "96136", units: 1 },
					{ code: "96137", units: 2 },
				],
			},
			{
				codes: [
					{ code: "96136", units: 1 },
					{ code: "96137", units: 2 },
				],
			},
			{
				codes: [
					{ code: "96136", units: 1 },
					{ code: "96137", units: 1 },
				],
			},
			{
				codes: [
					{ code: "96130", units: 1 },
					{ code: "96131", units: 1 },
				],
			},
		]);
	});

	it("applies a different unit cap to the 4th appointment", () => {
		const result = calculateAdditionalAppointments(600, 6, {
			maxAppt4Units: 2,
		});
		expect(result).toEqual([
			{
				codes: [
					{ code: "96136", units: 1 },
					{ code: "96137", units: 5 },
				],
			},
			{
				codes: [
					{ code: "96136", units: 1 },
					{ code: "96137", units: 5 },
				],
			},
			{
				codes: [
					{ code: "96136", units: 1 },
					{ code: "96137", units: 1 },
				],
			},
			{
				codes: [
					{ code: "96130", units: 1 },
					{ code: "96131", units: 1 },
				],
			},
			{
				codes: [{ code: "96131", units: 6 }],
			},
		]);
	});
});

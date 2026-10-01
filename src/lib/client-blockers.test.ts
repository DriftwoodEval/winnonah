import { describe, expect, it } from "vitest";
import {
	getRecordsBlockerReason,
	isCharterSchoolUnconfirmed,
	type RecordsBlockerInput,
} from "./client-blockers";

function input(overrides: Partial<RecordsBlockerInput>): RecordsBlockerInput {
	return {
		recordsNeeded: "Needed",
		hasExternalRecordContent: false,
		isCharterSchoolUnconfirmed: false,
		language: "English",
		holdUntil: null,
		requestedDates: [],
		hasPendingRequest: false,
		today: "2026-09-03",
		...overrides,
	};
}

describe("getRecordsBlockerReason", () => {
	it("returns null when records are not needed", () => {
		expect(
			getRecordsBlockerReason(input({ recordsNeeded: "Not Needed" })),
		).toBeNull();
	});

	it("returns null once external record content is on file", () => {
		expect(
			getRecordsBlockerReason(input({ hasExternalRecordContent: true })),
		).toBeNull();
	});

	it("flags an unconfirmed charter-school client that has no request yet", () => {
		expect(
			getRecordsBlockerReason(input({ isCharterSchoolUnconfirmed: true })),
		).toMatch(/charter school not yet confirmed/);
	});

	it("stops flagging an unconfirmed charter-school client once a request was sent", () => {
		expect(
			getRecordsBlockerReason(
				input({
					isCharterSchoolUnconfirmed: true,
					requestedDates: ["2026-08-01"],
				}),
			),
		).toBeNull();
	});

	it("reports an unsupported language", () => {
		expect(getRecordsBlockerReason(input({ language: "Portuguese" }))).toMatch(
			/English/,
		);
	});

	it("reports an active hold", () => {
		expect(getRecordsBlockerReason(input({ holdUntil: "2026-09-10" }))).toMatch(
			/on hold until/,
		);
	});

	it("stops blocking once records have been requested and no request is pending", () => {
		expect(
			getRecordsBlockerReason(input({ requestedDates: ["2026-08-01"] })),
		).toBeNull();
	});

	it("does not block for a pending request with no outstanding blocker", () => {
		expect(
			getRecordsBlockerReason(input({ hasPendingRequest: true })),
		).toBeNull();
	});

	it("reports records not yet requested when no request has ever existed", () => {
		expect(getRecordsBlockerReason(input({}))).toMatch(/not yet requested/);
	});
});

describe("isCharterSchoolUnconfirmed", () => {
	it("is true only when intake says yes and it is not confirmed", () => {
		expect(isCharterSchoolUnconfirmed({ charterSchool: "yes" })).toBe(true);
		expect(
			isCharterSchoolUnconfirmed({
				charterSchool: "yes",
				charterSchoolConfirmed: true,
			}),
		).toBe(false);
		expect(isCharterSchoolUnconfirmed({ charterSchool: "no" })).toBe(false);
		expect(isCharterSchoolUnconfirmed(null)).toBe(false);
	});
});

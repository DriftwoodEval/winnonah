import { describe, expect, it } from "vitest";
import {
	getRecordsBlockerReason,
	type RecordsBlockerInput,
} from "./client-blockers";

function input(overrides: Partial<RecordsBlockerInput>): RecordsBlockerInput {
	return {
		recordsNeeded: "Needed",
		asdAdhd: "ASD",
		hasExternalRecordContent: false,
		isPrivateSchool: false,
		language: "English",
		holdUntil: null,
		requestedDates: [],
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

	it("returns null for an ADHD-only client with no autism", () => {
		expect(getRecordsBlockerReason(input({ asdAdhd: "ADHD" }))).toBeNull();
		expect(
			getRecordsBlockerReason(input({ asdAdhd: "ADHD, anxiety" })),
		).toBeNull();
	});

	it("still blocks an ADHD-only client who has autism listed", () => {
		expect(getRecordsBlockerReason(input({ asdAdhd: "ASD/ADHD" }))).toMatch(
			/not yet requested/,
		);
	});

	it("flags a private-school ADHD-only client for a manual request", () => {
		expect(
			getRecordsBlockerReason(
				input({ asdAdhd: "ADHD", isPrivateSchool: true }),
			),
		).toMatch(/private-school/);
	});

	it("flags a private-school client before checking request history", () => {
		expect(
			getRecordsBlockerReason(
				input({ isPrivateSchool: true, requestedDates: ["2026-08-01"] }),
			),
		).toMatch(/private-school/);
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

	it("reports records requested but not received", () => {
		expect(
			getRecordsBlockerReason(input({ requestedDates: ["2026-08-01"] })),
		).toMatch(/requested on/);
	});

	it("reports records not yet requested", () => {
		expect(getRecordsBlockerReason(input({}))).toMatch(/not yet requested/);
	});
});

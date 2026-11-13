import { describe, expect, it } from "vitest";
import { type RecordsStatusInput, summarizeRecords } from "./records-status";

const TODAY = "2026-11-13";

function input(overrides: Partial<RecordsStatusInput>): RecordsStatusInput {
	return {
		recordsNeeded: "Needed",
		hasContent: false,
		requests: [],
		today: TODAY,
		...overrides,
	};
}

describe("summarizeRecords", () => {
	it.each([
		[
			"Not Needed wins over everything",
			{ recordsNeeded: "Not Needed", hasContent: true },
			"Not needed",
		],
		["notes entered", { hasContent: true }, "Reviewed"],
		["no requests at all", {}, "Not requested"],
		[
			"one request sent",
			{ requests: [{ requestedDate: "2026-11-01", holdUntil: null }] },
			"Requested",
		],
		[
			"two requests sent",
			{
				requests: [
					{ requestedDate: "2026-10-01", holdUntil: null },
					{ requestedDate: "2026-11-01", holdUntil: null },
				],
			},
			"Requested again",
		],
		[
			"waiting with a future hold",
			{ requests: [{ requestedDate: null, holdUntil: "2026-11-20" }] },
			"On hold",
		],
		[
			"waiting with a hold that has passed",
			{ requests: [{ requestedDate: null, holdUntil: "2026-11-01" }] },
			"Queued",
		],
		[
			"waiting with no hold",
			{ requests: [{ requestedDate: null, holdUntil: null }] },
			"Queued",
		],
		[
			"hold ending today still holds",
			{ requests: [{ requestedDate: null, holdUntil: TODAY }] },
			"On hold",
		],
		[
			"records status not set but notes entered",
			{ recordsNeeded: null, hasContent: true },
			"Reviewed",
		],
	] as [string, Partial<RecordsStatusInput>, string][])(
		"%s",
		(_name, overrides, expected) => {
			expect(summarizeRecords(input(overrides)).status).toBe(expected);
		},
	);

	it("reports the latest requested date and sent count", () => {
		const summary = summarizeRecords(
			input({
				requests: [
					{ requestedDate: "2026-11-01", holdUntil: null },
					{ requestedDate: "2026-10-01", holdUntil: null },
					{ requestedDate: null, holdUntil: null },
				],
			}),
		);
		expect(summary.latestRequestedDate).toBe("2026-11-01");
		expect(summary.requestCount).toBe(2);
	});
});

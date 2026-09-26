import { describe, expect, it } from "vitest";
import { formatAppointmentInfoBlock } from "./appointment-info-block";
import {
	getAppointmentLocation,
	getAppointmentType,
} from "./appointment-title";

describe("getAppointmentLocation / getAppointmentType", () => {
	it("resolves a DA + Evaluation office visit", () => {
		expect(getAppointmentLocation("Jane Doe [CHS-DE]")).toBe(
			"Charleston Office",
		);
		expect(getAppointmentType("Jane Doe [CHS-DE]")).toBe("DA + Evaluation");
	});

	it("resolves a virtual DA", () => {
		expect(getAppointmentLocation("Jane Doe [V]")).toBe("Virtual");
		expect(getAppointmentType("Jane Doe [V]")).toBe("DA");
	});
});

describe("formatAppointmentInfoBlock", () => {
	const startTime = new Date("2026-09-25T14:00:00Z");

	it("includes client fields when a client record matched", () => {
		const block = formatAppointmentInfoBlock({
			title: "Jane Doe [CHS-DE]",
			startTime,
			includePhone: true,
			client: {
				fullName: "Jane Doe",
				age: "5",
				phoneNumber: "8435551234",
				records: "Needed but not requested",
				babyNetERStatus: "Needed but not downloaded",
				questionnaires: [
					{ type: "ASQ", status: "PENDING", sent: "9/1/26" },
					{ type: "ASQ", status: "COMPLETED", sent: "8/1/26" },
				],
				clientNoteTitle: "Allergy",
				clientNote: "No peanuts.",
			},
		});

		expect(block).toContain("NAME: Jane Doe");
		expect(block).toContain("PHONE NUMBER: (843) 555-1234");
		expect(block).toContain("LOCATION: Charleston Office");
		expect(block).toContain("AGE: 5");
		expect(block).toContain("RECORDS: Needed but not requested");
		expect(block).toContain(
			"BabyNet Evaluation Report: Needed but not downloaded",
		);
		expect(block).toContain("  - ASQ: PENDING (sent 9/1/26)");
		expect(block).toContain("  - ASQ: COMPLETED");
		expect(block).not.toContain("COMPLETED (sent");
		expect(block).toContain("APPOINTMENT TYPE: DA + Evaluation");
		expect(block).toContain("NOTES: Allergy - No peanuts.");
	});

	it("falls back to a title-derived name with no client record", () => {
		const block = formatAppointmentInfoBlock({
			title: "John Smith [V]",
			startTime,
			includePhone: false,
			client: null,
		});

		expect(block).toContain("NAME: John Smith");
		expect(block).not.toContain("PHONE NUMBER");
		expect(block).toContain("LOCATION: Virtual");
		expect(block).toContain("APPOINTMENT TYPE: DA");
		expect(block).toContain("NOTES: ");
	});
});

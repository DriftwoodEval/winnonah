import { describe, expect, it } from "vitest";
import {
	reminderDeadlineDate,
	reminderDistancePhrase,
	reminderPluralization,
	substituteReminderPlaceholders,
} from "./reminder-messages";

describe("reminderPluralization", () => {
	it("uses singular forms for a count of 1", () => {
		expect(reminderPluralization(1)).toEqual({
			$QUESTIONNAIRE_WORD: "questionnaire",
			$IT_THEM: "it",
			$IT_THEY: "it",
			$IS_ARE: "is",
			$ITS_THEIR: "its",
		});
	});

	it("uses plural forms for counts other than 1", () => {
		expect(reminderPluralization(2)).toEqual({
			$QUESTIONNAIRE_WORD: "questionnaires",
			$IT_THEM: "them",
			$IT_THEY: "they",
			$IS_ARE: "are",
			$ITS_THEIR: "their",
		});
		expect(reminderPluralization(0).$QUESTIONNAIRE_WORD).toBe("questionnaires");
	});
});

describe("substituteReminderPlaceholders", () => {
	it("replaces every occurrence of each placeholder", () => {
		const result = substituteReminderPlaceholders(
			"Hi $CLIENT_FIRST_NAME, complete $IT_THEM. $CLIENT_FIRST_NAME!",
			{ $CLIENT_FIRST_NAME: "Alex", $IT_THEM: "them" },
		);
		expect(result).toBe("Hi Alex, complete them. Alex!");
	});

	it("leaves unknown placeholders untouched", () => {
		const result = substituteReminderPlaceholders("Hi $UNKNOWN", {
			$CLIENT_FIRST_NAME: "Alex",
		});
		expect(result).toBe("Hi $UNKNOWN");
	});
});

describe("reminderDistancePhrase", () => {
	it("returns 'today' when sent on the business-local today", () => {
		expect(reminderDistancePhrase("2026-08-25", "2026-08-25")).toBe("today");
	});

	it("returns a yesterday phrase for a one-day distance", () => {
		expect(reminderDistancePhrase("2026-08-24", "2026-08-25")).toBe(
			"on 8/24 (yesterday)",
		);
	});

	it("returns a days-ago phrase for older dates", () => {
		expect(reminderDistancePhrase("2026-08-18", "2026-08-25")).toBe(
			"on 8/18 (7 days ago)",
		);
	});

	it("is computed against the business-local today argument, not server local time", () => {
		// Regression: this must not read the server/browser's own clock. Passing
		// a business-local "today" explicitly is what makes it timezone-safe.
		expect(reminderDistancePhrase("2026-01-01", "2026-01-01")).toBe("today");
	});
});

describe("reminderDeadlineDate", () => {
	it("adds the escalation days to the business-local today as a calendar date", () => {
		expect(reminderDeadlineDate("2026-08-25", 3)).toBe("8/28");
	});

	it("rolls over month boundaries correctly", () => {
		expect(reminderDeadlineDate("2026-08-30", 3)).toBe("9/2");
	});

	it("rolls over year boundaries correctly", () => {
		expect(reminderDeadlineDate("2026-12-30", 3)).toBe("1/2");
	});
});

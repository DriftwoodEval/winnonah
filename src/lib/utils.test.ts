import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InsuranceWithAliases } from "~/lib/models";
import {
	cn,
	formatClientAge,
	formatError,
	formatPhoneNumber,
	formatReminderOffset,
	formatShortDate,
	formatTaMessage,
	getClosestOfficeKey,
	getInsuranceShortName,
	getInsuranceShortNamesList,
	getLocalDayFromUTCDate,
	getLocalTimeFromUTCDate,
	getReminderColorClass,
	getStatusColorClass,
	hasPermission,
	isNotesOnlyClientId,
	mapInsuranceToShortNames,
	normalizePhoneNumber,
	toTitleCase,
	userBadgeStyle,
} from "./utils";

describe("cn", () => {
	it("merges class names and resolves tailwind conflicts", () => {
		expect(cn("px-2", "px-4")).toBe("px-4");
	});

	it("drops falsy values", () => {
		expect(cn("a", false, undefined, null, "b")).toBe("a b");
	});
});

describe("toTitleCase", () => {
	it("capitalizes the first letter of each word and lowercases the rest", () => {
		expect(toTitleCase("hello WORLD")).toBe("Hello World");
	});
});

describe("hasPermission", () => {
	it("returns true when the permission is truthy", () => {
		expect(hasPermission({ "clients:notes": true }, "clients:notes")).toBe(
			true,
		);
	});

	it("returns false when the permission is missing", () => {
		expect(hasPermission({}, "clients:notes")).toBe(false);
	});
});

describe("formatError", () => {
	it("returns a friendly message for UNAUTHORIZED", () => {
		expect(formatError("UNAUTHORIZED")).toBe(
			"You do not have permission to perform this action.",
		);
	});

	it("replaces permission ids with their titles", () => {
		expect(formatError("Missing permission clients:notes")).toBe(
			'Missing permission "Edit Client Note Title & Content"',
		);
	});

	it("returns the message unchanged when no permission id matches", () => {
		expect(formatError("some other error")).toBe("some other error");
	});
});

const insurances: InsuranceWithAliases[] = [
	{
		id: 1,
		shortName: "BCBS",
		aliases: [{ name: "Blue Cross Blue Shield" }, { name: "Blue Cross" }],
	} as InsuranceWithAliases,
];

describe("getInsuranceShortName", () => {
	it("returns null for a null official name", () => {
		expect(getInsuranceShortName(null, insurances)).toBeNull();
	});

	it("matches by short name", () => {
		expect(getInsuranceShortName("BCBS", insurances)).toBe("BCBS");
	});

	it("matches by alias", () => {
		expect(getInsuranceShortName("Blue Cross", insurances)).toBe("BCBS");
	});

	it("falls back to the given name when there is no match", () => {
		expect(getInsuranceShortName("Unknown Payer", insurances)).toBe(
			"Unknown Payer",
		);
	});
});

describe("mapInsuranceToShortNames", () => {
	it("joins primary and secondary short names with a pipe", () => {
		expect(mapInsuranceToShortNames("BCBS", ["Blue Cross"], insurances)).toBe(
			"BCBS | BCBS",
		);
	});

	it("skips a null primary", () => {
		expect(mapInsuranceToShortNames(null, ["BCBS"], insurances)).toBe("BCBS");
	});

	it("handles no secondary insurances", () => {
		expect(mapInsuranceToShortNames("BCBS", null, insurances)).toBe("BCBS");
	});
});

describe("getInsuranceShortNamesList", () => {
	it("dedupes repeated short names across primary and secondary", () => {
		expect(
			getInsuranceShortNamesList("BCBS", ["Blue Cross"], insurances),
		).toEqual(["BCBS"]);
	});

	it("returns an empty list when nothing is set", () => {
		expect(getInsuranceShortNamesList(null, null, insurances)).toEqual([]);
	});
});

describe("formatClientAge", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-10T00:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("formats a long age under 3 years with years and months", () => {
		const dob = new Date("2025-02-10T00:00:00Z");
		expect(formatClientAge(dob)).toBe("1 years, 5 months");
	});

	it("formats a long age of 3 years or more as just years", () => {
		const dob = new Date("2020-08-10T00:00:00Z");
		expect(formatClientAge(dob)).toBe("5 years");
	});

	it("formats the short form as years:months under 3 years", () => {
		const dob = new Date("2025-02-10T00:00:00Z");
		expect(formatClientAge(dob, "short")).toBe("1:5");
	});

	it("formats the short form as just years at 3 years or more", () => {
		const dob = new Date("2020-08-10T00:00:00Z");
		expect(formatClientAge(dob, "short")).toBe("5");
	});

	it("formats the years-only form", () => {
		const dob = new Date("2020-08-10T00:00:00Z");
		expect(formatClientAge(dob, "years")).toBe("5");
	});
});

describe("getStatusColorClass", () => {
	it("returns the mapped class for a known status", () => {
		expect(getStatusColorClass("COMPLETED")).toBe("text-success");
	});

	it("returns the default class for null", () => {
		expect(getStatusColorClass(null)).toBe("text-gray-500");
	});
});

describe("getReminderColorClass", () => {
	it("returns empty string for null, undefined, or zero", () => {
		expect(getReminderColorClass(null)).toBe("");
		expect(getReminderColorClass(undefined)).toBe("");
		expect(getReminderColorClass(0)).toBe("");
	});

	it("returns success for a count of 1 or 2", () => {
		expect(getReminderColorClass(1)).toBe("text-success");
	});

	it("returns warning for a count of 2", () => {
		expect(getReminderColorClass(2)).toBe("text-warning");
	});

	it("returns error for a count of 3 or more", () => {
		expect(getReminderColorClass(3)).toBe("text-error");
	});
});

describe("formatReminderOffset", () => {
	it("formats sub-24-hour offsets in hours", () => {
		expect(formatReminderOffset(6)).toBe("6h before");
	});

	it("formats a 1-day offset as singular", () => {
		expect(formatReminderOffset(24)).toBe("1 day before");
	});

	it("formats multi-day offsets as plural", () => {
		expect(formatReminderOffset(48)).toBe("2 days before");
	});

	it("formats a fractional day offset to one decimal", () => {
		expect(formatReminderOffset(36)).toBe("1.5 days before");
	});
});

describe("formatPhoneNumber", () => {
	it("formats a 10-digit number", () => {
		expect(formatPhoneNumber("8435551234")).toBe("(843) 555-1234");
	});

	it("formats an 11-digit number with a leading 1 as +1", () => {
		expect(formatPhoneNumber("18435551234")).toBe("+1 (843) 555-1234");
	});
});

describe("normalizePhoneNumber", () => {
	it("prefixes a 10-digit number with +1", () => {
		expect(normalizePhoneNumber("8435551234")).toBe("+18435551234");
	});

	it("prefixes an 11-digit number starting with 1 with +", () => {
		expect(normalizePhoneNumber("18435551234")).toBe("+18435551234");
	});

	it("prefixes any other digit string with +", () => {
		expect(normalizePhoneNumber("+448435551234")).toBe("+448435551234");
	});
});

describe("getLocalDayFromUTCDate", () => {
	it("returns undefined for nullish input", () => {
		expect(getLocalDayFromUTCDate(null)).toBeUndefined();
		expect(getLocalDayFromUTCDate(undefined)).toBeUndefined();
	});

	it("returns undefined for an invalid date string", () => {
		expect(getLocalDayFromUTCDate("not a date")).toBeUndefined();
	});

	it("strips the time from a UTC date, keeping the same calendar day", () => {
		const result = getLocalDayFromUTCDate("2026-08-10T15:30:00Z");
		expect(result?.getFullYear()).toBe(2026);
		expect(result?.getMonth()).toBe(7);
		expect(result?.getDate()).toBe(10);
		expect(result?.getHours()).toBe(0);
	});
});

describe("getLocalTimeFromUTCDate", () => {
	it("returns undefined for nullish input", () => {
		expect(getLocalTimeFromUTCDate(null)).toBeUndefined();
	});

	it("returns undefined for an invalid date string", () => {
		expect(getLocalTimeFromUTCDate("not a date")).toBeUndefined();
	});

	it("preserves the UTC time-of-day as local time fields", () => {
		const result = getLocalTimeFromUTCDate("2026-08-10T15:30:45Z");
		expect(result?.getHours()).toBe(15);
		expect(result?.getMinutes()).toBe(30);
		expect(result?.getSeconds()).toBe(45);
	});
});

describe("formatTaMessage", () => {
	it("numbers each questionnaire link", () => {
		const result = formatTaMessage([
			{ questionnaireType: "DA", link: "https://a" },
			{ questionnaireType: "EVAL", link: "https://b" },
		]);
		expect(result).toBe("1) https://a\n2) https://b");
	});

	it("annotates self-report questionnaires", () => {
		const result = formatTaMessage([
			{ questionnaireType: "DA Self", link: "https://a" },
		]);
		expect(result).toBe("1) https://a - For client being tested");
	});
});

describe("formatShortDate", () => {
	it("formats a date as M/D/YY", () => {
		expect(formatShortDate("2026-08-10T15:00:00Z")).toBe("8/10/26");
	});

	it("returns the fallback for nullish input", () => {
		expect(formatShortDate(null)).toBe("N/A");
		expect(formatShortDate(undefined, "unknown")).toBe("unknown");
	});
});

describe("getClosestOfficeKey", () => {
	it("returns undefined for an empty office list", () => {
		expect(getClosestOfficeKey(32.78, -79.93, [])).toBeUndefined();
	});

	it("returns the key of the nearest office", () => {
		const offices = [
			{ key: "far", latitude: "40.7128", longitude: "-74.0060" },
			{ key: "near", latitude: "32.7765", longitude: "-79.9311" },
		];
		expect(getClosestOfficeKey(32.78, -79.93, offices)).toBe("near");
	});
});

describe("isNotesOnlyClientId", () => {
	it("returns true for a 5-character id", () => {
		expect(isNotesOnlyClientId("12345")).toBe(true);
	});

	it("returns false for other lengths", () => {
		expect(isNotesOnlyClientId("1234")).toBe(false);
		expect(isNotesOnlyClientId(123456)).toBe(false);
	});

	it("returns false for nullish input", () => {
		expect(isNotesOnlyClientId(null)).toBe(false);
		expect(isNotesOnlyClientId(undefined)).toBe(false);
	});
});

describe("userBadgeStyle", () => {
	it("is deterministic for the same name", () => {
		expect(userBadgeStyle("Jane Doe")).toEqual(userBadgeStyle("Jane Doe"));
	});

	it("returns a hsl background color and white text", () => {
		const style = userBadgeStyle("Jane Doe");
		expect(style.backgroundColor).toMatch(/^hsl\(\d+ 55% 40%\)$/);
		expect(style.color).toBe("white");
	});
});

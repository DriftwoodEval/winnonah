import { describe, expect, it } from "vitest";
import { userPreferencesSchema } from "./preferences";

describe("userPreferencesSchema", () => {
	it("parses an empty object to no preferences", () => {
		expect(userPreferencesSchema.parse({})).toEqual({});
	});

	it("keeps valid values", () => {
		const prefs = {
			homeWidgets: [{ id: "clients", cols: 2, rows: 1 }],
			headerItems: { desktop: ["docs"], mobile: [] },
			issueListOrder: ["dd4"],
			clientCardFields: ["age"],
		};
		expect(userPreferencesSchema.parse(prefs)).toEqual(prefs);
	});

	it("reads a malformed value as unset without dropping the other keys", () => {
		const parsed = userPreferencesSchema.parse({
			homeWidgets: [{ id: "clients", cols: 9, rows: 1 }],
			headerItems: "not an object",
			issueListOrder: ["dd4"],
		});
		expect(parsed).toEqual({ issueListOrder: ["dd4"] });
	});

	it("reads one bad header surface as unset and keeps the other", () => {
		const parsed = userPreferencesSchema.parse({
			headerItems: { desktop: 5, mobile: ["docs"] },
		});
		expect(parsed.headerItems).toEqual({ mobile: ["docs"] });
	});
});

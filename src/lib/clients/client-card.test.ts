import { describe, expect, it } from "vitest";
import {
	CLIENT_CARD_FIELD_IDS,
	DEFAULT_CLIENT_CARD_FIELDS,
	mergeClientCardFields,
} from "./client-card";

describe("mergeClientCardFields", () => {
	it.each([[null], [undefined], ["not an array"], [{}]])(
		"falls back to the defaults for %j",
		(stored) => {
			expect(mergeClientCardFields(stored)).toEqual(DEFAULT_CLIENT_CARD_FIELDS);
		},
	);

	it("keeps an empty selection, since it means every field is off", () => {
		expect(mergeClientCardFields([])).toEqual([]);
	});

	it("drops unknown and duplicate ids and returns fields in display order", () => {
		const result = mergeClientCardFields([
			"email",
			"notAField",
			"age",
			"email",
		]);
		expect(result).toEqual(["age", "email"]);
	});

	it("accepts every known field", () => {
		expect(mergeClientCardFields([...CLIENT_CARD_FIELD_IDS])).toEqual(
			CLIENT_CARD_FIELD_IDS,
		);
	});
});

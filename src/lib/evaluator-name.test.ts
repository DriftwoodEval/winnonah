import { describe, expect, it } from "vitest";
import { evaluatorDisplayName, evaluatorFirstName } from "~/lib/utils";

describe("evaluatorDisplayName", () => {
	it("replaces the first name with the preferred name", () => {
		expect(evaluatorDisplayName("Alexander (Alex) Smith")).toBe("Alex Smith");
	});

	it("leaves names without a preferred name alone", () => {
		expect(evaluatorDisplayName("Beth Jones")).toBe("Beth Jones");
	});

	it("handles a preferred name with no last name", () => {
		expect(evaluatorDisplayName("Alexander (Alex)")).toBe("Alex");
	});
});

describe("evaluatorFirstName", () => {
	it("uses the preferred name", () => {
		expect(evaluatorFirstName("Alexander (Alex) Smith")).toBe("Alex");
		expect(evaluatorFirstName("Beth Jones")).toBe("Beth");
	});
});

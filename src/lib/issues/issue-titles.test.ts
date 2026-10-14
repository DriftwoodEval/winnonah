import { describe, expect, it } from "vitest";
import {
	DEFAULT_ISSUE_LIST_ORDER,
	ISSUE_LIST_IDS,
	mergeIssueListOrder,
} from "./issue-titles";

describe("mergeIssueListOrder", () => {
	it("falls back to the alphabetical default when nothing is saved", () => {
		expect(mergeIssueListOrder(null)).toEqual(DEFAULT_ISSUE_LIST_ORDER);
	});

	it("keeps the saved order for known ids", () => {
		const reversed = [...ISSUE_LIST_IDS].reverse();
		expect(mergeIssueListOrder(reversed)).toEqual(reversed);
	});

	it("appends newly added lists in default order and drops removed ids", () => {
		const saved = ["dd4", "notARealList", "autismStops"];
		const result = mergeIssueListOrder(saved);

		expect(result[0]).toBe("dd4");
		expect(result[1]).toBe("autismStops");
		expect(result).not.toContain("notARealList");
		expect(new Set(result)).toEqual(new Set(ISSUE_LIST_IDS));
	});

	it("drops duplicate ids and falls back to the default for non-array input", () => {
		const result = mergeIssueListOrder(["dd4", "dd4", "autismStops"]);
		expect(result.filter((id) => id === "dd4")).toHaveLength(1);

		expect(mergeIssueListOrder("not an array")).toEqual(
			DEFAULT_ISSUE_LIST_ORDER,
		);
		expect(mergeIssueListOrder(undefined)).toEqual(DEFAULT_ISSUE_LIST_ORDER);
	});
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PERMISSION_GROUP_IDS } from "./types";

// python/utils/permissions.py keeps its own copy of the heading that covers each
// permission it checks. This keeps that copy in step with PERMISSIONS.
describe("python PERMISSION_GROUPS", () => {
	const source = readFileSync(
		join(process.cwd(), "python/utils/permissions.py"),
		"utf8",
	);
	const block = source.match(/PERMISSION_GROUPS = \{([\s\S]*?)\n\}/)?.[1];
	const entries = [...(block ?? "").matchAll(/"([^"]+)": "([^"]+)"/g)].map(
		(m) => [m[1], m[2]] as const,
	);

	it("finds the mapping", () => {
		expect(entries.length).toBeGreaterThan(0);
	});

	it.each(entries)("maps %s to its heading %s", (permission, group) => {
		expect(
			PERMISSION_GROUP_IDS[permission as keyof typeof PERMISSION_GROUP_IDS],
		).toBe(group);
	});
});

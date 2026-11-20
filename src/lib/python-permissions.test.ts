import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGACY_HEADING_FLAGS } from "./constants";
import { PERMISSION_GROUP_IDS } from "./types";

// python/utils/permissions.json is generated from PERMISSIONS so the Python side
// never keeps its own copy of the grouping. Each permission maps to its heading flag
// and, if it moved groups, the heading flag it used to sit under.
// Regenerate with: UPDATE_PYTHON_PERMISSIONS=1 pnpm exec vitest run src/lib/python-permissions.test.ts
describe("python permissions.json", () => {
	const path = join(process.cwd(), "python/utils/permissions.json");
	const expected = `${JSON.stringify(
		Object.fromEntries(
			Object.entries(PERMISSION_GROUP_IDS).map(([id, heading]) => [
				id,
				{ heading, legacy: LEGACY_HEADING_FLAGS[id] ?? null },
			]),
		),
		null,
		"\t",
	)}\n`;

	it("is up to date", () => {
		if (process.env.UPDATE_PYTHON_PERMISSIONS) {
			writeFileSync(path, expected);
		}
		expect(readFileSync(path, "utf8")).toBe(expected);
	});
});

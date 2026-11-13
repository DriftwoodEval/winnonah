import { describe, expect, it } from "vitest";
import type { PermissionId } from "~/lib/types";
import {
	getVisibleSettingsGroups,
	SETTINGS_GROUPS,
	SETTINGS_PAGES,
} from "./pages";

const noPermissions = () => false;
const allPermissions = () => true;

describe("SETTINGS_PAGES", () => {
	it("has unique ids", () => {
		const ids = SETTINGS_PAGES.map((page) => page.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("puts every page in a known group", () => {
		const groupIds = new Set(SETTINGS_GROUPS.map((group) => group.id));
		for (const page of SETTINGS_PAGES) {
			expect(groupIds.has(page.group)).toBe(true);
		}
	});
});

describe("getVisibleSettingsGroups", () => {
	it("shows every page to someone with all permissions", () => {
		const pages = getVisibleSettingsGroups(allPermissions).flatMap(
			(entry) => entry.pages,
		);
		expect(pages).toHaveLength(SETTINGS_PAGES.length);
	});

	it("hides pages that need a permission and drops empty groups", () => {
		const groups = getVisibleSettingsGroups(noPermissions);
		const pageIds = groups.flatMap((entry) => entry.pages.map((p) => p.id));
		expect(pageIds).not.toContain("run-logs");
		expect(pageIds).not.toContain("qsuite-general");
		expect(pageIds).toContain("preferences");
		expect(groups.map((entry) => entry.group.id)).not.toContain("qsuite");
	});

	it("shows a gated page once its permission is granted", () => {
		const can = (id: PermissionId) => id === "settings:run-logs:view";
		const pageIds = getVisibleSettingsGroups(can).flatMap((entry) =>
			entry.pages.map((p) => p.id),
		);
		expect(pageIds).toContain("run-logs");
		expect(pageIds).not.toContain("audit-log");
	});
});

import { describe, expect, it } from "vitest";
import type { PermissionId } from "~/lib/types";
import {
	getVisibleSettingsGroups,
	legacyTabToPage,
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

describe("legacyTabToPage", () => {
	it.each([
		["tab=preferences", "preferences"],
		["tab=people", "people"],
		["tab=people&peopleSubTab=staff", "people"],
		["tab=people&peopleSubTab=roles", "roles"],
		["tab=people&peopleSubTab=ei-contacts", "ei-contacts"],
		["tab=clinical", "insurances"],
		["tab=clinical&clinicalTab=assessments", "assessments"],
		["tab=clinical&clinicalTab=reminders", "questionnaire-reminders"],
		["tab=clinical&clinicalTab=report-queue", "report-queue"],
		["tab=scheduling", "appointment-sync"],
		["tab=scheduling&schedulingTab=reminders", "appointment-reminders"],
		["tab=scheduling&schedulingTab=durations", "appointment-durations"],
		["tab=qsuite", "qsuite-general"],
		["tab=qsuite&qsuiteTab=services", "qsuite-services"],
		["tab=qsuite&qsuiteTab=records", "qsuite-records"],
		["tab=qsuite&qsuiteTab=piecework", "qsuite-piecework"],
		["tab=downloads", "downloads"],
		["tab=audit-log", "audit-log"],
		["tab=run-logs", "run-logs"],
		["tab=babynet-report", "babynet-report"],
		["tab=post-visit-attachment", "post-visit-message"],
		["tab=issue-report", "issue-reports"],
	])("maps %s to %s", (query, expected) => {
		expect(legacyTabToPage(new URLSearchParams(query))).toBe(expected);
	});

	it("returns nothing without a known tab", () => {
		expect(legacyTabToPage(new URLSearchParams(""))).toBeUndefined();
		expect(legacyTabToPage(new URLSearchParams("tab=nope"))).toBeUndefined();
	});
});

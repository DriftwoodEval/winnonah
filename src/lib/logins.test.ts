import { describe, expect, it } from "vitest";
import { canAccessLogin, type LoginVerb, loginPermissionKey } from "./logins";
import type { PermissionsObject } from "./types";

const login = { id: 7 };
const VERBS: LoginVerb[] = ["view", "edit", "delete"];

function user(permissions: PermissionsObject = {}) {
	return { permissions };
}

function granting(...keys: string[]) {
	return user(Object.fromEntries(keys.map((key) => [key, true])));
}

describe("canAccessLogin", () => {
	it("denies a user with no permissions", () => {
		for (const verb of VERBS) {
			expect(canAccessLogin(user(), login, verb)).toBe(false);
		}
	});

	it("grants view to holders of the all-logins view permission only", () => {
		const viewer = user({ "settings:qsuite:services:view": true });
		expect(canAccessLogin(viewer, login, "view")).toBe(true);
		expect(canAccessLogin(viewer, login, "edit")).toBe(false);
		expect(canAccessLogin(viewer, login, "delete")).toBe(false);
	});

	it("grants view and edit, but not delete, to services editors", () => {
		const editor = user({ "settings:qsuite:services": true });
		expect(canAccessLogin(editor, login, "view")).toBe(true);
		expect(canAccessLogin(editor, login, "edit")).toBe(true);
		expect(canAccessLogin(editor, login, "delete")).toBe(false);
	});

	it("grants delete from the global delete permission", () => {
		const deleter = user({ "settings:qsuite:logins:delete": true });
		expect(canAccessLogin(deleter, login, "delete")).toBe(true);
		expect(canAccessLogin(deleter, login, "edit")).toBe(false);
	});

	it("uses the permissions for that login only", () => {
		const editor = granting(loginPermissionKey(7, "edit"));
		expect(canAccessLogin(editor, login, "edit")).toBe(true);
		expect(canAccessLogin(editor, { id: 8 }, "edit")).toBe(false);
	});

	it("treats edit and delete permission as including view", () => {
		expect(
			canAccessLogin(granting(loginPermissionKey(7, "edit")), login, "view"),
		).toBe(true);
		expect(
			canAccessLogin(granting(loginPermissionKey(7, "delete")), login, "view"),
		).toBe(true);
	});

	it("does not let view permission imply edit", () => {
		const viewer = granting(loginPermissionKey(7, "view"));
		expect(canAccessLogin(viewer, login, "edit")).toBe(false);
	});
});

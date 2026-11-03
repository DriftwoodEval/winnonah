import { describe, expect, it } from "vitest";
import { canAccessLogin, emptyLoginAccess, type LoginVerb } from "./logins";
import type { PermissionsObject } from "./types";

function user(permissions: PermissionsObject = {}, roleId: number | null = 5) {
	return { id: "u1", roleId, permissions };
}

describe("canAccessLogin", () => {
	it("denies a user with no permissions and an empty access list", () => {
		const login = { access: emptyLoginAccess() };
		for (const verb of ["view", "edit", "delete"] as LoginVerb[]) {
			expect(canAccessLogin(user(), login, verb)).toBe(false);
		}
	});

	it("grants view to holders of the all-logins view permission only", () => {
		const login = { access: emptyLoginAccess() };
		const viewer = user({ "settings:qsuite:services:view": true });
		expect(canAccessLogin(viewer, login, "view")).toBe(true);
		expect(canAccessLogin(viewer, login, "edit")).toBe(false);
		expect(canAccessLogin(viewer, login, "delete")).toBe(false);
	});

	it("grants view and edit, but not delete, to services editors", () => {
		const login = { access: emptyLoginAccess() };
		const editor = user({ "settings:qsuite:services": true });
		expect(canAccessLogin(editor, login, "view")).toBe(true);
		expect(canAccessLogin(editor, login, "edit")).toBe(true);
		expect(canAccessLogin(editor, login, "delete")).toBe(false);
	});

	it("grants delete from the global delete permission", () => {
		const login = { access: emptyLoginAccess() };
		const deleter = user({ "settings:qsuite:logins:delete": true });
		expect(canAccessLogin(deleter, login, "delete")).toBe(true);
		expect(canAccessLogin(deleter, login, "edit")).toBe(false);
	});

	it("uses the login's own access list by user and by role", () => {
		const access = emptyLoginAccess();
		access.edit.userIds.push("u1");
		access.delete.roleIds.push(5);
		const login = { access };
		expect(canAccessLogin(user(), login, "edit")).toBe(true);
		expect(canAccessLogin(user(), login, "delete")).toBe(true);
		expect(canAccessLogin(user({}, null), login, "delete")).toBe(false);
	});

	it("treats edit and delete access as including view", () => {
		const access = emptyLoginAccess();
		access.edit.userIds.push("u1");
		expect(canAccessLogin(user(), { access }, "view")).toBe(true);
	});

	it("does not let view access imply edit", () => {
		const access = emptyLoginAccess();
		access.view.userIds.push("u1");
		expect(canAccessLogin(user(), { access }, "edit")).toBe(false);
	});
});

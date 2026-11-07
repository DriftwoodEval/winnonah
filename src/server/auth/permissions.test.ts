import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findRole = vi.fn();

vi.mock("~/server/db", () => ({
	db: { query: { roles: { findFirst: findRole } } },
}));

const { clearRoleCache, mergePermissions, resolvePermissions } = await import(
	"./permissions"
);

beforeEach(() => {
	vi.useFakeTimers();
	findRole.mockReset();
	clearRoleCache();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("mergePermissions", () => {
	it("lets a user's own value win over their role's, including an explicit off", () => {
		expect(
			mergePermissions(
				{ "reports:approve": false },
				{ "reports:approve": true, "clients:download": true },
			),
		).toEqual({ "reports:approve": false, "clients:download": true });
	});

	it("handles a user with no overrides or a role with no permissions", () => {
		expect(mergePermissions(null, { "clients:download": true })).toEqual({
			"clients:download": true,
		});
		expect(mergePermissions({ "clients:download": true }, undefined)).toEqual({
			"clients:download": true,
		});
	});
});

describe("resolvePermissions", () => {
	it("returns the user's own permissions without reading a role when they have none", async () => {
		const result = await resolvePermissions({
			permissions: { "clients:download": true },
			roleId: null,
		});

		expect(result).toEqual({ "clients:download": true });
		expect(findRole).not.toHaveBeenCalled();
	});

	it("layers the user's permissions over the role's", async () => {
		findRole.mockResolvedValue({
			permissions: { "reports:approve": true, "clients:download": true },
		});

		const result = await resolvePermissions({
			permissions: { "reports:approve": false },
			roleId: 1,
		});

		expect(result).toEqual({
			"reports:approve": false,
			"clients:download": true,
		});
	});

	it("reads a role once while it is cached", async () => {
		findRole.mockResolvedValue({ permissions: { "clients:download": true } });
		const user = { permissions: null, roleId: 1 };

		await resolvePermissions(user);
		await resolvePermissions(user);
		await resolvePermissions({ permissions: null, roleId: 1 });

		expect(findRole).toHaveBeenCalledTimes(1);
	});

	it("keeps separate entries for separate roles", async () => {
		findRole.mockResolvedValue({ permissions: {} });

		await resolvePermissions({ permissions: null, roleId: 1 });
		await resolvePermissions({ permissions: null, roleId: 2 });

		expect(findRole).toHaveBeenCalledTimes(2);
	});

	it("reads the role again after a role edit clears it", async () => {
		findRole.mockResolvedValueOnce({
			permissions: { "clients:download": true },
		});
		const user = { permissions: null, roleId: 1 };
		expect(await resolvePermissions(user)).toEqual({
			"clients:download": true,
		});

		findRole.mockResolvedValueOnce({ permissions: {} });
		clearRoleCache(1);

		expect(await resolvePermissions(user)).toEqual({});
		expect(findRole).toHaveBeenCalledTimes(2);
	});

	it("leaves other roles cached when one is cleared", async () => {
		findRole.mockResolvedValue({ permissions: {} });
		await resolvePermissions({ permissions: null, roleId: 1 });
		await resolvePermissions({ permissions: null, roleId: 2 });

		clearRoleCache(1);
		await resolvePermissions({ permissions: null, roleId: 2 });

		expect(findRole).toHaveBeenCalledTimes(2);
	});

	it("reads the role again once the cache time has passed", async () => {
		findRole.mockResolvedValue({ permissions: {} });
		const user = { permissions: null, roleId: 1 };

		await resolvePermissions(user);
		vi.advanceTimersByTime(29_000);
		await resolvePermissions(user);
		expect(findRole).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(2_000);
		await resolvePermissions(user);
		expect(findRole).toHaveBeenCalledTimes(2);
	});

	it("treats a role that no longer exists as having no permissions", async () => {
		findRole.mockResolvedValue(undefined);

		expect(
			await resolvePermissions({
				permissions: { "clients:download": true },
				roleId: 99,
			}),
		).toEqual({ "clients:download": true });
	});
});

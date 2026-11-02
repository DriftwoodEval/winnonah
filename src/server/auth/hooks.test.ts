import { beforeEach, describe, expect, it, vi } from "vitest";

const findUser = vi.fn();
const findInvitation = vi.fn();
const findRole = vi.fn();
const transaction = vi.fn();
const deleteWhere = vi.fn();
const deleteFrom = vi.fn(() => ({ where: deleteWhere }));
const recordAuthAudit = vi.fn();

vi.mock("~/env", () => ({
	env: {
		AUTH_URL: "http://localhost:3000",
		AUTH_SECRET: "test-secret-test-secret-test-secret",
		AUTH_GOOGLE_ID: "id",
		AUTH_GOOGLE_SECRET: "secret",
		AUTH_GOOGLE_WORKSPACE_DOMAIN: "example.com",
	},
}));
vi.mock("~/server/db", () => ({
	db: {
		query: {
			users: { findFirst: findUser },
			invitations: { findFirst: findInvitation },
			roles: { findFirst: findRole },
		},
		transaction,
		delete: deleteFrom,
	},
}));
vi.mock("~/lib/integrations/redis", () => ({ redis: {} }));
vi.mock("~/lib/logger", () => ({
	logger: { child: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) },
}));
vi.mock("~/server/auth/audit", () => ({ recordAuthAudit }));

const { authInstance } = await import("./config");
const hooks = authInstance.options.databaseHooks;

// The hooks only read a few fields, so a partial record is enough.
const call = (hook: unknown, ...args: unknown[]) =>
	(hook as (...a: unknown[]) => Promise<unknown>)(...args);

beforeEach(() => {
	for (const mock of [
		findUser,
		findInvitation,
		findRole,
		transaction,
		deleteWhere,
		deleteFrom,
		recordAuthAudit,
	]) {
		mock.mockReset();
	}
	deleteFrom.mockReturnValue({ where: deleteWhere });
	deleteWhere.mockResolvedValue(undefined);
	recordAuthAudit.mockResolvedValue(undefined);
});

describe("before a session is created", () => {
	const before = hooks?.session?.create?.before;

	it("lets an active user in", async () => {
		findUser.mockResolvedValue({ email: "a@example.com", archived: false });
		expect(await call(before, { userId: "u1" })).toBeUndefined();
		expect(recordAuthAudit).not.toHaveBeenCalled();
	});

	it("refuses an archived user and records the attempt", async () => {
		findUser.mockResolvedValue({ email: "a@example.com", archived: true });

		expect(await call(before, { userId: "u1" })).toBe(false);

		expect(recordAuthAudit).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "u1",
				action: "auth.sign_in_blocked",
				success: false,
			}),
		);
	});

	it("refuses a user that no longer exists", async () => {
		findUser.mockResolvedValue(undefined);
		expect(await call(before, { userId: "gone" })).toBe(false);
	});
});

describe("before a user is created", () => {
	const before = hooks?.user?.create?.before;

	it.each([
		[{ email: "a@example.com", emailVerified: true }, undefined],
		[{ email: "a@example.com", emailVerified: false }, false],
		[{ email: "", emailVerified: true }, false],
	])("checks %j", async (user, expected) => {
		expect(await call(before, user)).toBe(expected);
	});
});

describe("after a user is created", () => {
	const after = hooks?.user?.create?.after;
	const user = { id: "u1", email: "new@example.com" };

	it("sets the user up in one transaction", async () => {
		findInvitation.mockResolvedValue(null);
		findRole.mockResolvedValue({ id: 3 });
		transaction.mockResolvedValue(undefined);

		await call(after, user);

		expect(transaction).toHaveBeenCalledTimes(1);
		expect(deleteFrom).not.toHaveBeenCalled();
	});

	it("removes the new user and fails the sign-in when setup fails", async () => {
		findInvitation.mockResolvedValue(null);
		findRole.mockResolvedValue({ id: 3 });
		const failure = new Error("deadlock");
		transaction.mockRejectedValue(failure);

		await expect(call(after, user)).rejects.toBe(failure);

		// Without this the user would exist with no role, and this hook never
		// runs again for an existing user.
		expect(deleteFrom).toHaveBeenCalledTimes(1);
		expect(deleteWhere).toHaveBeenCalledTimes(1);
	});
});

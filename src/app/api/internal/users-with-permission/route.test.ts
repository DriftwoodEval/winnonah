import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();

vi.mock("~/server/auth/internal-api", () => ({
	checkInternalApiAuth: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("~/server/db", () => ({
	db: { query: { users: { findMany } } },
}));

const { GET } = await import("./route");

function request(query: string) {
	return new NextRequest(
		`https://app.example.com/api/internal/users-with-permission?${query}`,
	);
}

const alice = {
	email: "alice@example.com",
	name: "Alice",
	claimedReportFolder: null,
	blockedEvaluatorNpis: null,
	permissions: { "reports:notifications": true },
	role: null,
};
const bob = {
	email: "bob@example.com",
	name: "Bob",
	claimedReportFolder: null,
	blockedEvaluatorNpis: null,
	permissions: {},
	role: { permissions: { "reports:notifications": true } },
};
const carol = {
	email: "carol@example.com",
	name: "Carol",
	claimedReportFolder: null,
	blockedEvaluatorNpis: null,
	permissions: { "reports:notifications": false },
	role: { permissions: { "reports:notifications": true } },
};

beforeEach(() => {
	findMany.mockResolvedValue([alice, bob, carol]);
});

describe("GET /api/internal/users-with-permission", () => {
	it("returns users who hold the permission through their own flag or their role", async () => {
		const response = await GET(request("permission=reports:notifications"));
		const emails = (await response.json()).map(
			(user: { email: string }) => user.email,
		);
		// Carol's own flag overrides her role.
		expect(emails).toEqual(["alice@example.com", "bob@example.com"]);
	});

	it("matches the email filter regardless of case", async () => {
		const response = await GET(
			request("permission=reports:notifications&email=ALICE@Example.com"),
		);
		const emails = (await response.json()).map(
			(user: { email: string }) => user.email,
		);
		expect(emails).toEqual(["alice@example.com"]);
	});

	it("matches no one for an empty email filter", async () => {
		const response = await GET(
			request("permission=reports:notifications&email="),
		);
		expect(await response.json()).toEqual([]);
	});

	it.each(["constructor", "toString", "__proto__", "not:a-permission", ""])(
		"rejects %j as an unknown permission",
		async (permission) => {
			const response = await GET(
				request(`permission=${encodeURIComponent(permission)}`),
			);
			expect(response.status).toBe(400);
			expect(findMany).not.toHaveBeenCalled();
		},
	);
});

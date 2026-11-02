import { describe, expect, it, vi } from "vitest";

vi.mock("~/env", () => ({
	env: {
		AUTH_URL: "http://localhost:3000",
		AUTH_SECRET: "test-secret-test-secret-test-secret",
		AUTH_GOOGLE_ID: "id",
		AUTH_GOOGLE_SECRET: "secret",
		AUTH_GOOGLE_WORKSPACE_DOMAIN: "example.com",
	},
}));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/lib/integrations/redis", () => ({ redis: {} }));
vi.mock("~/lib/logger", () => ({
	logger: { child: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) },
}));

const { authInstance } = await import("./config");
const { CLIENT_IP_HEADERS } = await import("./client-ip");

// Everything the app's own pages and server code use over HTTP.
const USED_PATHS = [
	"/sign-in/social",
	"/callback/:id",
	"/get-session",
	"/sign-out",
	"/impersonation/start",
	"/impersonation/stop",
	"/error",
	"/ok",
];

function post(path: string) {
	return authInstance.handler(
		new Request(`http://localhost:3000/api/auth${path}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		}),
	);
}

describe("auth hardening", () => {
	const disabled = authInstance.options.disabledPaths ?? [];

	it("keeps every endpoint the app uses enabled", () => {
		expect(disabled.filter((path) => USED_PATHS.includes(path))).toEqual([]);
	});

	it.each([
		"/update-user",
		"/get-access-token",
		"/refresh-token",
		"/link-social",
		"/unlink-account",
		"/revoke-sessions",
		"/sign-in/email",
		"/sign-up/email",
		"/delete-user",
	])("answers 404 for %s", async (path) => {
		expect(disabled).toContain(path);
		expect((await post(path)).status).toBe(404);
	});

	it("still serves the health endpoint", async () => {
		const response = await authInstance.handler(
			new Request("http://localhost:3000/api/auth/ok"),
		);
		expect(response.status).toBe(200);
	});

	it("encrypts stored Google tokens", () => {
		expect(authInstance.options.account?.encryptOAuthTokens).toBe(true);
	});

	it("does not link a new Google account to an existing user by email", () => {
		expect(
			authInstance.options.account?.accountLinking?.disableImplicitLinking,
		).toBe(true);
	});

	it("turns telemetry off", () => {
		expect(authInstance.options.telemetry?.enabled).toBe(false);
	});

	it("reads the client address from the trusted headers", () => {
		expect(authInstance.options.advanced?.ipAddress?.ipAddressHeaders).toEqual(
			CLIENT_IP_HEADERS,
		);
	});
});

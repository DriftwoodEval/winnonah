import { beforeEach, describe, expect, it, vi } from "vitest";

const getAccessToken = vi.fn();
const refreshToken = vi.fn();
const findAccount = vi.fn();
const readCache = vi.fn();
const writeCache = vi.fn();

vi.mock("~/env", () => ({
	env: { AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "secret" },
}));
vi.mock("~/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("~/server/auth/config", () => ({
	authInstance: { api: { getAccessToken, refreshToken } },
}));
vi.mock("~/server/db", () => ({
	db: { query: { accounts: { findFirst: findAccount } } },
}));
vi.mock("~/server/auth/google-token-cache", () => ({
	readCachedGoogleToken: readCache,
	writeCachedGoogleToken: writeCache,
}));

const { createUserOAuth2Client } = await import("./google-credentials");

function requestToken(client: ReturnType<typeof createUserOAuth2Client>) {
	const handler = client.refreshHandler;
	if (!handler) throw new Error("refreshHandler is not set");
	return handler();
}

const expiresAt = new Date("2030-01-01T00:00:00Z");

beforeEach(() => {
	vi.resetAllMocks();
	findAccount.mockResolvedValue({ id: "acc1", refreshToken: "refresh" });
	readCache.mockResolvedValue(null);
});

describe("createUserOAuth2Client", () => {
	it("uses a cached token without asking Better Auth", async () => {
		const cached = { access_token: "cached", expiry_date: 123 };
		readCache.mockResolvedValue(cached);

		const token = await requestToken(createUserOAuth2Client("u1"));

		expect(token).toEqual(cached);
		expect(getAccessToken).not.toHaveBeenCalled();
	});

	it("asks Better Auth for the token and caches it", async () => {
		getAccessToken.mockResolvedValue({
			accessToken: "fresh",
			accessTokenExpiresAt: expiresAt,
		});

		const token = await requestToken(createUserOAuth2Client("u1"));

		expect(getAccessToken).toHaveBeenCalledWith({
			body: { accountId: "acc1", userId: "u1" },
		});
		expect(token).toEqual({
			access_token: "fresh",
			expiry_date: expiresAt.getTime(),
		});
		expect(writeCache).toHaveBeenCalledWith("u1", token);
	});

	it("refreshes explicitly when Better Auth does not know the expiry", async () => {
		getAccessToken.mockResolvedValue({ accessToken: "old" });
		refreshToken.mockResolvedValue({
			accessToken: "new",
			accessTokenExpiresAt: expiresAt,
		});

		const token = await requestToken(createUserOAuth2Client("u1"));

		expect(token.access_token).toBe("new");
	});

	it("skips the cache and refreshes on every request after the first", async () => {
		const client = createUserOAuth2Client("u1");
		readCache.mockResolvedValue({ access_token: "cached", expiry_date: 1 });
		await requestToken(client);

		refreshToken.mockResolvedValue({
			accessToken: "renewed",
			accessTokenExpiresAt: expiresAt,
		});
		const token = await requestToken(client);

		expect(refreshToken).toHaveBeenCalledTimes(1);
		expect(token.access_token).toBe("renewed");
	});

	it("asks the user to sign in again when there is no refresh token", async () => {
		findAccount.mockResolvedValue({ id: "acc1", refreshToken: null });

		await expect(
			requestToken(createUserOAuth2Client("u1")),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("asks the user to sign in again when the refresh fails", async () => {
		getAccessToken.mockRejectedValue(new Error("invalid_grant"));

		await expect(
			requestToken(createUserOAuth2Client("u1")),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});

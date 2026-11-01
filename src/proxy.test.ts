import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

function request(path: string, cookie?: string) {
	return new NextRequest(`https://app.example.com${path}`, {
		headers: cookie ? { cookie } : {},
	});
}

describe("proxy", () => {
	it("lets a request with a session cookie through", () => {
		const response = proxy(
			request("/clients/directory", "better-auth.session_token=abc.sig"),
		);
		expect(response.headers.get("location")).toBeNull();
		expect(response.status).toBe(200);
	});

	it("also accepts the secure cookie name", () => {
		const response = proxy(
			request("/", "__Secure-better-auth.session_token=abc.sig"),
		);
		expect(response.headers.get("location")).toBeNull();
	});

	it("sends a request without a cookie to the sign-in page", () => {
		const response = proxy(request("/clients/directory?status=all"));
		const location = new URL(response.headers.get("location") ?? "");
		expect(location.pathname).toBe("/login");
		expect(location.searchParams.get("callbackUrl")).toBe(
			"/clients/directory?status=all",
		);
	});

	it("ignores cookies that are not the session cookie", () => {
		const response = proxy(request("/", "theme=dark"));
		expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
			"/login",
		);
	});
});
